/**
 * Created by Rajinda on 11/15/2016.
 */

var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var DbConn = require('dvp-dbmodels');
var moment = require('moment');
var Sequelize = require('sequelize');
var redis = require('redis');
var async = require("async");
var config = require('config');
var directPayment = require('../Stripe/DirectPayment');
var Q = require('q');

var client = redis.createClient(config.Redis.port, config.Redis.ip);
client.auth(config.Redis.password);
client.select(config.Redis.redisdb, redis.print);
//client.select(config.Redis.redisdb, function () { /* ... */ });
client.on("error", function (err) {
    logger.error('error', 'Redis connection error :: %s', err);
    console.log("Error " + err);
});

client.on("connect", function (err) {
    client.select(config.Redis.redisdb, redis.print);
});
var lock = require("redis-lock")(client);
var ttl = config.Redis.ttl;

var buyCredit = function (walletId, amount, user) {

    var deferred = Q.defer();

    if (walletId) {
        lock(walletId, ttl, function (done) {
            console.log("Lock acquired" + walletId);

            DbConn.Wallet.find({
                where: [{WalletId: walletId}, {Owner: user.iss}, {TenantId: user.tenant}, {CompanyId: user.company}, {Status: true}]
            }).then(function (wallet) {
                if (wallet) {
                    amount = parseFloat(amount);
                    // buy credit form strip
                    directPayment.BuyCredit(wallet, amount).then(function (charge) {
                        var credit = parseFloat(wallet.Credit) + amount;
                        DbConn.Wallet
                            .update(
                                {
                                    Credit: credit
                                },
                                {
                                    where: [{WalletId: wallet.WalletId}]
                                }
                            ).then(function (cmp) {
                            done();
                            if (cmp[0] === 1) {
                                deferred.resolve(credit);
                            }
                            else {
                                deferred.reject(new Error("Fail to Update Wallet. Please Contact System Administrator."));
                            }
                            var data = {
                                StripeId: undefined,
                                Description: "Buy Credit using Credit Card",
                                CurrencyISO: wallet.CurrencyISO,
                                Credit: credit,
                                Tag: undefined,
                                TenantId: user.tenant,
                                CompanyId: user.company,
                                OtherJsonData: {
                                    "amount": amount,
                                    "Balance": credit,
                                    "msg": "BuyCredit",
                                    "invokeBy": user.iss
                                },
                                WalletId: cmp.WalletId,
                                Operation: 'BuyCredit',
                                InvokeBy: user.iss,
                                Reason: "Buy Credit using Credit Card"
                            };
                            addHistory(data);
                        }).error(function (err) {
                            done();
                            deferred.reject(err);
                        });

                    }, function (error) {
                        done();
                        deferred.reject(error);
                    });
                }
                else {
                    done();
                    deferred.reject(new Error("Invalid Wallet ID"));
                }
            }).error(function (err) {
                done();
                deferred.reject(err);
            });
        });

    }
    else {
        deferred.reject(new Error("Invalid Wallet ID"));
    }
    return deferred.promise;
};

var deductCredit = function (reqData, wallet, credit, amount) {

    var deferred = Q.defer();

    lock(wallet.WalletId, ttl, function (done) {
        if (wallet) {
            if (credit > amount) {
                credit = credit - amount;
                DbConn.Wallet
                    .update(
                        {
                            Credit: credit
                        },
                        {
                            where: [{WalletId: wallet.WalletId}]
                        }
                    ).then(function (cmp) {
                    done();
                    if (cmp[0] === 1) {
                        deferred.resolve(credit);
                    }
                    else {
                        deferred.reject(new Error("Fail to Update Wallet. Please Contact System Administrator."));
                    }
                    var data = {
                        StripeId: undefined,
                        Description: reqData.description,
                        CurrencyISO: undefined,
                        Credit: credit + parseFloat(wallet.LockCredit),
                        DeductCredit:amount,
                        Tag: undefined,
                        TenantId: reqData.user.tenant,
                        CompanyId: reqData.user.company,
                        OtherJsonData: {
                            "msg": "DeductCredit",
                            "amount": amount, "Balance": credit, "LockCredit": wallet.LockCredit,
                            "invokeBy": reqData.name ? reqData.name : reqData.user.iss,
                            "OtherJsonData": reqData.OtherJsonData
                        },
                        WalletId: cmp.WalletId,
                        Operation: 'DeductCredit',
                        InvokeBy: reqData.name ? reqData.name : reqData.user.iss,
                        Reason: reqData.Reason ? reqData.Reason : "Deduct Credit using Credit Card",
                        SessionID: reqData.SessionID
                    };
                    addHistory(data);
                }).error(function (error) {
                    done();
                    deferred.reject(error);
                });
            }
            else {
                done();
                deferred.reject(new Error("Insufficient  Credit Balance."));
            }
        }
    });

    return deferred.promise;
};

var deductCreditFromCustomer = function (reqData, amountDeduct, callback) {

    DbConn.Wallet.find({
        where: [{TenantId: reqData.user.tenant}, {CompanyId: reqData.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            var amount = parseFloat(amountDeduct);
            var credit = parseFloat(wallet.Credit);
            if (credit >= amount) {
                deductCredit(reqData, wallet, credit, amount).then(function (cmp) {
                    var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
                    logger.info('DeductCredit - Update Wallet - [%s] .', jsonString);
                    callback(jsonString);
                }, function (error) {
                    var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                    logger.error('DeductCredit - Fail To Update Wallet. - [%s] .', jsonString);
                    callback(jsonString);
                });
            }
            else {
                if (wallet.AutoRecharge) {
                    buyCredit(wallet.WalletId, wallet.AutoRechargeAmount, reqData.user).then(function (cmp) {
                        if (cmp > amount) {
                            wallet.Credit = cmp;
                            credit = cmp;
                            deductCredit(reqData, wallet, credit, amount).then(function (cmp) {
                                var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
                                logger.info('DeductCredit-buyCredit - Update Wallet - [%s] .', jsonString);
                                callback(jsonString);
                            }, function (error) {
                                var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                                logger.error('DeductCredit-buyCredit - Fail To Update Wallet. - [%s] .', jsonString);
                                callback(jsonString);
                            });
                        }
                        else {
                            var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                            logger.error('[DeductCredit] - [%s] ', jsonString);
                            callback(jsonString);
                        }

                    }, function (error) {
                        var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                        logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
                        callback(jsonString);
                    });
                }
                else {
                    var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                    logger.error('[DeductCredit] - [%s] ', jsonString);
                    callback(jsonString);
                }
            }
        }
        else {
            var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
            logger.error('[DeductCredit] - [%s] ', jsonString);
            callback(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[DeductCredit] - [%s] ', jsonString);
        callback(jsonString);
    });

};

module.exports.CreatePackage = function (req, res) {

    directPayment.DirectPayment(req.body).then(function (customer) {
        DbConn.Wallet
            .create(
                {
                    Owner: req.user.iss,
                    StripeId: customer.id,
                    Description: req.body.Description,
                    Tag: req.body.Tag,
                    CurrencyISO: req.body.CurrencyISO,
                    Credit: req.body.Credit,
                    Status: true,
                    AutoRecharge: req.body.CurrencyISO,
                    AutoRechargeAmount: 0,
                    ThresholdValue: 0,
                    TenantId: req.user.tenant,
                    CompanyId: req.user.company
                }
            ).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('CreatePackage - Create Wallet - [%s] .', jsonString);
            req.body.WalletId = cmp.WalletId;
            this.BuyCredit(req.body.Amount, req.body.user);
            var data = {
                StripeId: customer.id,
                Description: req.body.Description,
                CurrencyISO: req.body.CurrencyISO,
                Credit: 0,
                Tag: req.body.Tag,
                TenantId: req.user.tenant,
                CompanyId: req.user.company,
                OtherJsonData: {"msg": "Create New Wallet", "invokeBy": req.user.iss},
                WalletId: cmp.WalletId,
                Operation: 'CreatePackage',
                InvokeBy: req.user.iss,
                Reason: "Create Package"
            };
            addHistory(data);
        }).error(function (err) {
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('CreatePackage - Fail To Create Wallet. - [%s] .', jsonString);
            res.end(jsonString);
        });

    }, function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('CreatePackage-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
        res.end(jsonString);
    });

};

module.exports.CreateWallet = function (req, res) {

    directPayment.CustomerRegister(req.headers['api_key'], req.body).then(function (customer) {

        DbConn.Wallet
            .create(
                {
                    Owner: req.user.iss,
                    StripeId: customer.id,
                    Description: req.body.Description,
                    Tag: req.body.Tag,
                    CurrencyISO: req.body.CurrencyISO,
                    Credit: 0,
                    Status: true,
                    AutoRecharge: req.body.AutoRecharge,
                    AutoRechargeAmount: 0,
                    ThresholdValue: 0,
                    TenantId: req.user.tenant,
                    CompanyId: req.user.company
                }
            ).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('CreateWallet - Create Wallet - [%s] .', jsonString);
            res.end(jsonString);
            var data = {
                StripeId: customer.id,
                Description: req.body.Description,
                CurrencyISO: req.body.CurrencyISO,
                Credit: 0,
                Tag: req.body.Tag,
                TenantId: req.user.tenant,
                CompanyId: req.user.company,
                OtherJsonData: {"msg": "Create New Wallet", "invokeBy": req.user.iss},
                WalletId: cmp.WalletId,
                Operation: 'CreateWallet',
                InvokeBy: req.user.iss,
                Reason: "Create Wallet"
            };
            addHistory(data);
        }).error(function (err) {
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('CreateWallet - Fail To Create Wallet. - [%s] .', jsonString);
            res.end(jsonString);
        });

    }, function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('CreateWallet-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
        res.end(jsonString);
    });
};

module.exports.CreateWalletBulk = function (req, res) {

    var jsonString = messageFormatter.FormatMessage(new Error('Not Implemented.'), "EXCEPTION", false, undefined);
    logger.error('CreateWallet-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
    res.end(jsonString);

    /*  var task = [];
     if(req.body.Organisations){
     req.body.Organisations.forEach(function (item) {
     task.push(function createContact(callback) {
     directPayment.CustomerRegister(item).then(function (customer) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, customer);
     callback(jsonString);
     }, function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('CreateWallet-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
     callback(jsonString);
     });
     });
     });
     }



     async.parallel(task, function(err, results) {
     if(err){

     }
     else{
     if(results){
     var items = [];
     results.forEach(function(item){
     var obj = {
     Owner: req.user.iss,
     StripeId: item.id,
     Description: req.body.Description,
     Tag: req.body.Tag,
     CurrencyISO: req.body.CurrencyISO,
     Credit: 0,
     Status: true,
     TenantId: req.user.tenant,
     CompanyId: req.user.company
     };
     items.push(obj);
     });
     if(items.length>0){
     var jsonString;
     DbConn.Wallet.bulkCreate(
     results, {validate: false, individualHooks: true}
     ).then(function (results) {
     jsonString = messageFormatter.FormatMessage(undefined, "SUCCESS", true, results);
     logger.info('CreateWalletBulk - UploadContacts successfully.[%s] ', jsonString);
     res.end(jsonString);
     }).catch(function (err) {
     jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('CreateWalletBulk - failed', err);
     res.end(jsonString);
     }).finally(function () {

     });
     }
     }
     }
     });
     */
};

module.exports.UpdateWallet = function (req, res) {

    DbConn.Wallet
        .update(
            {
                AutoRechargeAmount: req.body.AutoRechargeAmount,
                AutoRecharge: req.body.AutoRecharge,
                ThresholdValue: req.body.ThresholdValue
            },
            {
                where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
            }
        ).then(function (cmp) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
        logger.info('UpdateWallet - Update Wallet - [%s] .', jsonString);
        res.end(jsonString);
        var data = {
            StripeId: "",
            Description: req.body.Description,
            CurrencyISO: "",
            Credit: 0,
            Tag: req.body.Tag,
            TenantId: req.user.tenant,
            CompanyId: req.user.company,
            OtherJsonData: {"Data": req.body, "invokeBy": req.user.iss},
            WalletId: cmp.WalletId,
            Operation: 'UpdateWallet',
            InvokeBy: req.user.iss,
            Reason: "Apply Configurations"
        };
        addHistory(data);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('UpdateWallet - Fail To Update Wallet. - [%s] .', jsonString);
        res.end(jsonString);
    });
};

module.exports.BuyCredit = function (req, res) {

    buyCredit(req.params.WalletId, req.body.Amount, req.user).then(function (cmp) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
        logger.info('BuyCredit - Update Wallet - [%s] .', jsonString);
        res.end(jsonString);

    }, function (error) {
        var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
        logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
        res.end(jsonString);
    });
};

/*module.exports.BuyCredit = function (req, res) {
 var walletId = req.params.WalletId;
 if (walletId) {
 lock(walletId, ttl, function (done) {
 console.log("Lock acquired" + walletId);
 // No one else will be able to get a lock on 'myLock' until you call done()  done();

 DbConn.Wallet.find({
 where: [{WalletId: walletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
 }).then(function (wallet) {
 if (wallet) {
 var amount = parseFloat(req.body.Amount);
 // buy credit form strip
 directPayment.BuyCredit(wallet, amount).then(function (charge) {
 var credit = parseFloat(wallet.Credit) + amount;
 DbConn.Wallet
 .update(
 {
 Credit: credit
 },
 {
 where: [{WalletId: wallet.WalletId}]
 }
 ).then(function (cmp) {
 var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", cmp[0] === 1, cmp[0] === 1 ? credit : 0);
 logger.info('BuyCredit - Update Wallet - [%s] .', jsonString);
 done();
 res.end(jsonString);
 var data = {
 StripeId: undefined,
 Description: undefined,
 CurrencyISO: undefined,
 Credit: credit,
 Tag: undefined,
 TenantId: req.user.tenant,
 CompanyId: req.user.company,
 OtherJsonData: {"msg": "BuyCredit", "invokeBy": req.user.iss},
 WalletId: cmp.WalletId
 };
 addHistory(data);
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
 logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
 done();
 res.end(jsonString);
 });

 }, function (error) {
 var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
 logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
 done();
 res.end(jsonString);
 });
 }
 else {
 var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
 logger.error('[BuyCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 }
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
 logger.error('[BuyCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 });
 });

 }
 else {
 var jsonString = messageFormatter.FormatMessage(new Error("No Wallet ID"), "EXCEPTION", false, undefined);
 logger.error('[BuyCredit] - [%s] ', jsonString);
 res.end(jsonString);
 }
 };*/

module.exports.BuyCreditFormSelectedCard = function (req, res) {
    /*if (req.params.WalletId) {
     lock(req.params.WalletId, ttl, function (done) {
     console.log("Lock acquired" + req.params.WalletId);
     // No one else will be able to get a lock on 'myLock' until you call done()  done();

     DbConn.Wallet.find({
     where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
     }).then(function (wallet) {
     if (wallet) {
     var amount = parseFloat(req.body.Amount);
     var walData = {
     CurrencyISO: wallet.CurrencyISO,
     StripeId: req.params.cardId
     };

     directPayment.BuyCredit(walData, amount).then(function (charge) {

     DbConn.Wallet
     .update(
     {
     Credit: wallet.Credit + amount
     },
     {
     where: [{WalletId: wallet.WalletId}]
     }
     ).then(function (cmp) {
     var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
     logger.info('BuyCredit - Update Wallet - [%s] .', jsonString);
     done();
     res.end(jsonString);
     var data = {
     StripeId: undefined,
     Description: undefined,
     CurrencyISO: undefined,
     Credit: cmp.Credit,
     Tag: undefined,
     TenantId: req.user.tenant,
     CompanyId: req.user.company,
     OtherJsonData: {"msg": "BuyCredit", "invokeBy": req.user.iss},
     WalletId: cmp.WalletId
     };
     addHistory(data);
     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
     done();
     res.end(jsonString);
     });

     }, function (error) {
     var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
     logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
     done();
     res.end(jsonString);
     });
     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
     logger.error('[BuyCredit] - [%s] ', jsonString);
     done();
     res.end(jsonString);
     }
     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('[BuyCredit] - [%s] ', jsonString);
     done();
     res.end(jsonString);
     });
     });

     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("No Wallet ID"), "EXCEPTION", false, undefined);
     logger.error('[BuyCredit] - [%s] ', jsonString);
     res.end(jsonString);
     }*/
};

/*module.exports.DeductCredit = function (req, res) {

 lock(req.params.WalletId, ttl, function (done) {
 console.log("Lock acquired" + req.params.WalletId);
 // No one else will be able to get a lock on 'myLock' until you call done()  done();
 DbConn.Wallet.find({
 where: [{WalletId: req.params.WalletId}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
 }).then(function (wallet) {
 if (wallet) {
 var amount = parseFloat(req.body.Amount);
 var credit = parseFloat(wallet.Credit);
 if (credit > amount) {
 credit = credit - amount;
 DbConn.Wallet
 .update(
 {
 Credit: credit
 },
 {
 where: [{WalletId: wallet.WalletId}]
 }
 ).then(function (cmp) {
 var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, credit);
 logger.info('DeductCredit - Update Wallet - [%s] .', jsonString);
 done();
 res.end(jsonString);
 var data = {
 StripeId: undefined,
 Description: req.body.Reason,
 CurrencyISO: undefined,
 Credit: credit,
 Tag: undefined,
 TenantId: req.user.tenant,
 CompanyId: req.user.company,
 OtherJsonData: {"msg": "DeductCredit", "amount": amount, "invokeBy": req.user.iss},
 WalletId: cmp.WalletId
 };
 addHistory(data);
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
 logger.error('DeductCredit - Fail To Update Wallet. - [%s] .', jsonString);
 done();
 res.end(jsonString);
 });
 }
 else {
 var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
 logger.error('[DeductCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 }
 }
 else {
 var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
 logger.error('[DeductCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 }
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
 logger.error('[DeductCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 });
 });

 };*/

module.exports.DeductCredit = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            var amount = parseFloat(req.body.Amount);
            var credit = parseFloat(wallet.Credit);
            if (credit > amount) {
                deductCredit(req, wallet, credit, amount).then(function (cmp) {
                    var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
                    logger.info('DeductCredit - Update Wallet - [%s] .', jsonString);
                    res.end(jsonString);
                }, function (error) {
                    var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                    logger.error('DeductCredit - Fail To Update Wallet. - [%s] .', jsonString);
                    res.end(jsonString);
                });
            }
            else {
                if (wallet.AutoRecharge) {
                    if (wallet.ThresholdValue > credit) {
                        var b = wallet.AutoRechargeAmount - credit;
                        if (b > 0 && b > amount) {
                            buyCredit(wallet.WalletId, b, req.user).then(function (cmp) {
                                if (cmp > amount) {
                                    deductCredit(req, wallet, credit, amount).then(function (cmp) {
                                        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
                                        logger.info('DeductCredit-buyCredit - Update Wallet - [%s] .', jsonString);
                                        res.end(jsonString);
                                    }, function (error) {
                                        var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                                        logger.error('DeductCredit-buyCredit - Fail To Update Wallet. - [%s] .', jsonString);
                                        res.end(jsonString);
                                    });
                                }
                                else {
                                    var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                                    logger.error('[DeductCredit] - [%s] ', jsonString);
                                    res.end(jsonString);
                                }

                            }, function (error) {
                                var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                                logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
                                res.end(jsonString);
                            });
                        }
                        else {
                            var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                            logger.error('[DeductCredit] - [%s] ', jsonString);
                            res.end(jsonString);
                        }
                    }
                    else {
                        var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                        logger.error('[DeductCredit] - [%s] ', jsonString);
                        res.end(jsonString);
                    }
                }
                else {
                    var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                    logger.error('[DeductCredit] - [%s] ', jsonString);
                    res.end(jsonString);
                }
            }
        }
        else {
            var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
            logger.error('[DeductCredit] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[DeductCredit] - [%s] ', jsonString);
        res.end(jsonString);
    });


};

module.exports.DeductCreditFormCustomer = function (req, res) {

    /*var user = {
     tenant:123,
     company:123,
     iss:'123'
     };*/

    var reqData = {
        description: req.body.description,
        user: req.user,
        name: req.body.name,
        OtherJsonData: req.body.OtherJsonData,
        Reason: req.body.Reason,
        SessionID: req.body.SessionId
    };

    deductCreditFromCustomer(reqData, req.body.Amount, function (jsonString) {
        res.end(jsonString);
    });


    /* DbConn.Wallet.find({
     where: [{TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
     }).then(function (wallet) {
     if (wallet) {
     var amount = parseFloat(req.body.Amount);
     var credit = parseFloat(wallet.Credit);
     if (credit >= amount) {
     deductCredit(req, wallet, credit, amount).then(function (cmp) {
     var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
     logger.info('DeductCredit - Update Wallet - [%s] .', jsonString);
     res.end(jsonString);
     }, function (error) {
     var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
     logger.error('DeductCredit - Fail To Update Wallet. - [%s] .', jsonString);
     res.end(jsonString);
     });
     }
     else {
     if (wallet.AutoRecharge) {
     buyCredit(wallet.WalletId, wallet.AutoRechargeAmount, req.user).then(function (cmp) {
     if (cmp > amount) {
     deductCredit(req, wallet, credit, amount).then(function (cmp) {
     var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
     logger.info('DeductCredit-buyCredit - Update Wallet - [%s] .', jsonString);
     res.end(jsonString);
     }, function (error) {
     var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
     logger.error('DeductCredit-buyCredit - Fail To Update Wallet. - [%s] .', jsonString);
     res.end(jsonString);
     });
     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
     logger.error('[DeductCredit] - [%s] ', jsonString);
     res.end(jsonString);
     }

     }, function (error) {
     var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
     logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
     res.end(jsonString);
     });
     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
     logger.error('[DeductCredit] - [%s] ', jsonString);
     res.end(jsonString);
     }
     }
     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
     logger.error('[DeductCredit] - [%s] ', jsonString);
     res.end(jsonString);
     }
     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('[DeductCredit] - [%s] ', jsonString);
     res.end(jsonString);
     });
     */
};

module.exports.CreditBalance = function (req, res) {

    DbConn.Wallet.find({
        where: [{TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, 0);
        if (wallet) {
            var data = {
                "WalletId": wallet.WalletId,
                "Credit": wallet.Credit,
                "AutoRechargeAmount": wallet.AutoRechargeAmount,
                "AutoRecharge": wallet.AutoRecharge,
                "ThresholdValue": wallet.ThresholdValue
            };
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, data);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", false, undefined);
        }
        logger.info('CreditBalance -  Wallet - [%s] .', jsonString);
        res.end(jsonString);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[CreditBalance] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.CreditBalanceById = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, 0);
        if (wallet) {
            var data = {
                "WalletId": wallet.WalletId,
                "Credit": wallet.Credit
            };
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, data);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", false, 0);
        }
        logger.info('CreditBalance -  Wallet - [%s] .', jsonString);
        res.end(jsonString);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[CreditBalance] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.AddNewCard = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            directPayment.AddNewCard(wallet.StripeId, req.headers['api_key']).then(function (customer) {

                var jsonString = messageFormatter.FormatMessage(undefined, "Add new Card Successfully.", true, customer.id);
                logger.info('AddNewCard - Update Wallet - [%s] .', jsonString);
                res.end(jsonString);

                var data = {
                    StripeId: wallet.StripeId,
                    Description: req.body.Description,
                    CurrencyISO: undefined,
                    Credit: 0,
                    Tag: undefined,
                    TenantId: req.user.tenant,
                    CompanyId: req.user.company,
                    OtherJsonData: {"msg": "AddNewCard", "Data": customer, "invokeBy": req.user.iss},
                    WalletId: wallet.WalletId
                };
                addHistory(data);

            }, function (err) {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                logger.error('CreatePackage-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
                res.end(jsonString);
            });
        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Wallet ID", false, undefined);
            logger.error('[AddNewCard] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[AddNewCard] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.RemoveCard = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            directPayment.ListCards(wallet.StripeId).then(function (cards) {
                if (cards.data && cards.data.length > 1) {
                    directPayment.DeleteCard(wallet.StripeId, req.params.CardId).then(function (customer) {
                        if (customer.deleted) {
                            var jsonString = messageFormatter.FormatMessage(undefined, "Card Was Removed Form System.", true, customer.id);
                            logger.info('RemoveCard - Update Wallet - [%s] .', jsonString);
                            res.end(jsonString);
                            var data = {
                                StripeId: wallet.StripeId,
                                Description: undefined,
                                CurrencyISO: undefined,
                                Credit: 0,
                                Tag: undefined,
                                TenantId: req.user.tenant,
                                CompanyId: req.user.company,
                                OtherJsonData: {"msg": "RemoveCard", "Data": customer, "invokeBy": req.user.iss},
                                WalletId: wallet.WalletId
                            };
                            addHistory(data);
                        }
                        else {
                            var jsonString = messageFormatter.FormatMessage(undefined, "Fail To Remove Card form Wallet", false, undefined);
                            logger.error('RemoveCard-DirectPayment - Fail To Remove Card form Wallet. - [%s] .', jsonString);
                            res.end(jsonString);
                        }
                    }, function (err) {
                        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                        logger.error('RemoveCard-DirectPayment - Fail To Remove Card form  Wallet. - [%s] .', jsonString);
                        res.end(jsonString);
                    });
                }
                else {
                    var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Card Details Or No Card Added. if You want to Delete Default Card, Please Contact System Administrator'.", false, undefined);
                    logger.error('RemoveCard - Fail To Get Card Details.. - [%s] .', jsonString);
                    res.end(jsonString);
                }
            }, function (err) {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                logger.error('RemoveCard - Fail To Get Card Details.. - [%s] .', jsonString);
                res.end(jsonString);
            });
        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Wallet ID", false, undefined);
            logger.error('[RemoveCard] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[RemoveCard] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.ListCards = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            directPayment.ListCards(wallet.StripeId).then(function (cards) {

                var cardDetails = cards.data.map(function (item) {
                    var obj = {
                        id: item.id,
                        name: item.name,
                        brand: item.brand,
                        last4: item.last4
                    };
                    return obj
                });

                var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cardDetails);
                logger.info('ListCards - Get Card Details. - [%s] .', jsonString);
                res.end(jsonString);
            }, function (err) {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                logger.error('ListCards - Fail To Get Card Details.. - [%s] .', jsonString);
                res.end(jsonString);
            });
        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Wallet ID", false, undefined);
            logger.error('[RemoveCard] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[RemoveCard] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.SetDefaultCard = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {

            directPayment.SetDefaultCard(wallet.StripeId, req.params.CardId).then(function (cards) {
                var jsonString = messageFormatter.FormatMessage(undefined, "Successfully Set Default card", true, undefined);
                logger.info('SetDefaultCard - . - [%s] .', jsonString);
                res.end(jsonString);

                var data = {
                    StripeId: wallet.StripeId,
                    Description: undefined,
                    CurrencyISO: undefined,
                    Credit: 0,
                    Tag: undefined,
                    TenantId: req.user.tenant,
                    CompanyId: req.user.company,
                    OtherJsonData: {"msg": "SetDefaultCard", "Data": cards, "invokeBy": req.user.iss},
                    WalletId: wallet.WalletId
                };
                addHistory(data);

            }, function (err) {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                logger.error('SetDefaultCard - Fail Set Default Card. - [%s] .', jsonString);
                res.end(jsonString);
            });

        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Wallet ID", false, undefined);
            logger.error('[SetDefaultCard] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[SetDefaultCard] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

var addWalletSessionData = function (data) {
    try {
        DbConn.WalletSessionData
            .create(
                {
                    Credit: data.Credit,
                    LockCredit: data.LockCredit,
                    SessionID: data.SessionID,
                    TenantId: data.TenantId,
                    CompanyId: data.CompanyId,
                    InvokeBy: data.InvokeBy
                }
            ).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('addWalletSessionData - [%s] .', jsonString);
        }).error(function (err) {
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('addWalletSessionData. - [%s] .', jsonString);
        });
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error('addWalletSessionData. - [%s] .', jsonString);
    }


};

var DeleteWalletSessionData = function (data) {
    try {
        var deferred = Q.defer();
        DbConn.WalletSessionData
            .destroy(
                {
                    where: [{SessionID: data.SessionID}, {TenantId: data.TenantId}, {CompanyId: data.CompanyId}]
                }
            ).then(function (cmp) {
            if (cmp === 1) {
                deferred.resolve(true);
            }
            else {
                deferred.reject(false);
            }
        }).error(function (err) {
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('DeleteWalletSessionData. - [%s] .', jsonString);
            deferred.reject(false);
        });
        return deferred.promise;
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error('DeleteWalletSessionData. - [%s] .', jsonString);
    }


};

var ValidateSessionData = function (data) {
    var deferred = Q.defer();
    DbConn.WalletSessionData
        .find(
            {
                where: [{SessionID: data.SessionID}, {TenantId: data.TenantId}, {CompanyId: data.CompanyId}]
            }
        ).then(function (cmp) {
        deferred.resolve(cmp);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('ValidateSessionData. - [%s] .', jsonString);
        deferred.reject(false);
    });
    return deferred.promise;

};

var addHistory = function (data) {

    DbConn.WalletHistory
        .create(
            {
                StripeId: data.customerId,
                Description: data.Description,
                CurrencyISO: data.CurrencyISO,
                Credit: data.Credit,
                DeductCredit: data.DeductCredit,
                TenantId: data.TenantId,
                CompanyId: data.CompanyId,
                OtherJsonData: data.OtherJsonData,
                WalletId: data.WalletId,
                Operation: data.Operation,
                InvokeBy: data.InvokeBy,
                Reason: data.Reason,
                SessionID: data.SessionID
            }
        ).then(function (cmp) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
        logger.info('addHistory - Create WalletHistory - [%s] .', jsonString);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('addHistory - Fail To Create WalletHistory. - [%s] .', jsonString);
    });

};

var calculateChargeForSession = function (sessionId, credit, tenant, company, invokeBy) {

    //dbModel.CallCDRProcessed.aggregate('HoldSec', 'avg', {where :[{CreatedTime : { gte: st , lt: et}, HoldSec: {gt: 0}, CompanyId: companyId, TenantId: tenantId, DVPCallDirection: 'inbound', AgentAnswered: true, ObjType: 'HTTAPI'}]}).then(function(holdAvg)

    DbConn.WalletHistory.aggregate('DeductCredit', 'sum',{
        where: [{TenantId: tenant}, {CompanyId: company}, {SessionID: sessionId}]
    }).then(function (cmp) {
        if (cmp) {
            var data = {
                StripeId: undefined,
                Description: "Charges For Call Session " + sessionId,
                CurrencyISO: "$",
                Credit: credit,
                DeductCredit:cmp,
                Tag: undefined,
                TenantId: tenant,
                CompanyId: company,
                OtherJsonData: {
                    "amount":cmp,
                    "msg": "DeductCredit",
                    "ChargesForCall": cmp, "Balance": credit,
                    "invokeBy": invokeBy,
                    "OtherJsonData": "{'sessionId':" + sessionId + "}"
                },
                //WalletId: cmp.WalletId,
                Operation: 'ChargesForCall',
                InvokeBy: invokeBy,
                Reason: "ChargesForCall",
                SessionID: sessionId
            };
            addHistory(data)
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('calculateChargeForSession. - [%s] .', jsonString);
    });

};

module.exports.getWalletHistory = function (req, res) {

    var pageNo = req.params.pageNo;
    var rowCount = req.params.rowCount;


    /*DbConn.Wallet.find({
     where: [{Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
     }).then(function (walletData) {
     var jsonString ;
     if (walletData) {*/

    DbConn.WalletHistory.findAll({
        where: [{TenantId: req.user.tenant}, {CompanyId: req.user.company},{Operation:'ChargesForCall'}],
        order: [['createdAt', 'DESC']],
        offset: ((pageNo - 1) * rowCount),
        limit: rowCount

    }).then(function (walletHistory) {
        var jsonString;
        if (walletHistory) {

            jsonString = messageFormatter.FormatMessage(undefined, "SUCCESS", true, walletHistory);
            res.end(jsonString);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "NO HISTORY RECORD FOUND", false, 0);
            res.end(jsonString);
        }

    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[wallet history ] - [%s] ', jsonString);
        res.end(jsonString);
    });

    /*}
     else
     {
     jsonString = messageFormatter.FormatMessage(undefined, "NO WALLET RECORD FOUND", false, 0);
     res.end(jsonString);
     }


     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('[Search wallet data ] - [%s] ', jsonString);
     res.end(jsonString);
     });*/


};

var LockCredit = function (sessionId, amount, invokeBy, reason, tenant, company) {

    var deferred = Q.defer();

    var data = {SessionID: sessionId, TenantId: tenant, CompanyId: company};
    ValidateSessionData(data).then(function (val) {
        if (val==undefined) {
            DbConn.Wallet.find({
                where: [{TenantId: tenant}, {CompanyId: company}, {Status: true}]
            }).then(function (wallet) {
                if (!sessionId) {
                    deferred.reject(new Error("Invalid Session Id."));
                    return;
                }
                if (wallet) {
                    lock(sessionId, ttl, function (done) {
                        var credit = parseFloat(wallet.Credit);
                        var lockCredit = parseFloat(wallet.LockCredit);
                        if (credit > amount) {
                            credit = credit - amount;
                            lockCredit = lockCredit + amount;
                            DbConn.Wallet
                                .update(
                                    {
                                        Credit: credit,
                                        LockCredit: lockCredit
                                    },
                                    {
                                        where: [{WalletId: wallet.WalletId}]
                                    }
                                ).then(function (cmp) {
                                done();
                                if (cmp[0] === 1) {
                                    deferred.resolve(credit);
                                }
                                else {
                                    deferred.reject(new Error("Fail to Update Wallet. Please Contact System Administrator."));
                                }

                                var data = {
                                    StripeId: undefined,
                                    Description: "Lock Credit",
                                    CurrencyISO: undefined,
                                    Credit: credit,
                                    LockCredit:amount,
                                    Tag: undefined,
                                    TenantId: tenant,
                                    CompanyId: company,
                                    OtherJsonData: {
                                        "msg": "DeductCredit",
                                        "amount": amount, "Balance": credit,
                                        "LockCredit": lockCredit,
                                        "invokeBy": invokeBy,
                                        "OtherJsonData": "{'sessionId':" + sessionId + "}"
                                    },
                                    WalletId: cmp.WalletId,
                                    Operation: 'DeductCredit',
                                    InvokeBy: invokeBy,
                                    Reason: reason ? reason : "Credit Locked By System",
                                    SessionID: sessionId
                                };
                                addWalletSessionData(data);
                                addHistory(data);
                            }).error(function (error) {
                                done();
                                deferred.reject(error);
                            });
                        }
                        else {
                            done();
                            deferred.reject(new Error("Insufficient  Credit Balance."));
                        }
                    });
                }
                else {
                    deferred.reject(new Error("Fail to Find Wallet. Please Contact System Administrator."));
                }
            }).error(function (err) {
                deferred.reject(err);
            });
        }
        else {
            deferred.reject(new Error("Invalid Session ID."));
        }

    }, function (error) {
        deferred.reject(error);
    });
    return deferred.promise;
};

var ReleaseCredit = function (sessionId, amount, invokeBy, reason, tenant, company) {
    var deferred = Q.defer();
    var data = {SessionID: sessionId, TenantId: tenant, CompanyId: company};
    ValidateSessionData(data).then(function (val) {
        if (val==undefined) {
            deferred.reject(new Error("Invalid Session ID."));
        }
        else {
            amount = val.LockCredit;
            DbConn.Wallet.find({
                where: [{TenantId: tenant}, {CompanyId: company}, {Status: true}]
            }).then(function (wallet) {
                if (wallet) {
                    var walletId = sessionId ? sessionId : wallet.WalletId;
                    lock(walletId, ttl, function (done) {
                        var lockCredit = parseFloat(wallet.LockCredit) - parseFloat(amount);
                        if (lockCredit < 0) {
                            deferred.reject(new Error("Invalid Amount. Please Contact System Administrator."));
                            return;
                        }
                        var credit = parseFloat(wallet.Credit) + parseFloat(amount);
                        DbConn.Wallet
                            .update(
                                {
                                    Credit: credit,
                                    LockCredit: lockCredit
                                },
                                {
                                    where: [{WalletId: wallet.WalletId}]
                                }
                            ).then(function (cmp) {
                            done();
                            if (cmp[0] === 1) {
                                deferred.resolve(credit);
                            }
                            else {
                                deferred.reject(new Error("Fail to Update Wallet. Please Contact System Administrator."));
                            }
                            var data = {
                                StripeId: undefined,
                                Description: "Release Credit",
                                CurrencyISO: undefined,
                                Credit: credit,
                                Tag: undefined,
                                TenantId: tenant,
                                CompanyId: company,
                                OtherJsonData: {
                                    "msg": "DeductCredit",
                                    "amount": wallet.LockCredit, "Balance": credit,
                                    "LockCredit": wallet.LockCredit,
                                    "invokeBy": invokeBy,
                                    "OtherJsonData": undefined
                                },
                                WalletId: cmp.WalletId,
                                Operation: 'DeductCredit',
                                InvokeBy: invokeBy,
                                Reason: reason ? reason : "Credit Released By System",
                                SessionID: sessionId
                            };
                            DeleteWalletSessionData(data);
                            addHistory(data);
                            calculateChargeForSession(sessionId, credit, tenant, company, invokeBy);
                        }).error(function (error) {
                            done();
                            deferred.reject(error);
                        });
                    });
                }
                else {
                    deferred.reject(new Error("Fail to Find Wallet. Please Contact System Administrator."));
                }
            }).error(function (err) {
                deferred.reject(err);
            });
        }
    }, function (error) {

    });

    return deferred.promise;

};

module.exports.LockCreditFromCustomer = function (req, res) {
    if (!req.body.SessionId || req.body.Amount <= 0) {
        var jsonString = messageFormatter.FormatMessage(new Error("Invalid Details."), "EXCEPTION", false, undefined);
        logger.error('LockCreditFromCustomer -  [%s] .', jsonString);
        res.end(jsonString);
    }
    else {


        LockCredit(req.body.SessionId, req.body.Amount, req.user.iss, req.body.Reason, req.user.tenant, req.user.company).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('LockCreditFromCustomer - [%s] .', jsonString);
            res.end(jsonString);
        }, function (error) {
            var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
            logger.error('LockCreditFromCustomer -  [%s] .', jsonString);
            res.end(jsonString);
        });
    }

};

module.exports.ReleaseCreditFromCustomer = function (req, res) {
    if (req.body.Amount <= 0) {
        var jsonString = messageFormatter.FormatMessage(new Error("Invalid Details."), "EXCEPTION", false, undefined);
        logger.error('LockCreditFromCustomer -  [%s] .', jsonString);
        res.end(jsonString);
    }
    else {
        ReleaseCredit(req.body.SessionId, req.body.Amount, req.user.iss, req.body.Reason, req.user.tenant, req.user.company).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('ReleaseCredit - [%s] .', jsonString);
            res.end(jsonString);
        }, function (error) {
            var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
            logger.error('ReleaseCredit -  [%s] .', jsonString);
            res.end(jsonString);
        });
    }

};