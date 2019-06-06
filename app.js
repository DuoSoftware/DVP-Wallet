/**
 * Created by Rajinda on 8/24/2015.
 */

var restify = require('restify');

var config = require('config');
var port = config.Host.port || 3000;
var version = config.Host.version;

var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var subscriptionsHandler = require('./Stripe/SubscriptionsHandler');
var walletHandler = require('./Wallet/WalletHandler');
var webhookHandler = require('./Stripe/WebhookHandler');
var directPayment = require('./Stripe/DirectPayment');
var fs = require('fs');
var healthcheck = require('dvp-healthcheck/DBHealthChecker');

//-------------------------  Restify Server ------------------------- \\

var jwt = require('restify-jwt');
var secret = require('dvp-common/Authentication/Secret.js');
var authorization = require('dvp-common/Authentication/Authorization.js');

var http_server = restify.createServer({
    name: 'WalletServer',
    version: '1.0.0'
});

/*var https_options = {
    ca: fs.readFileSync('/etc/ssl/fb/COMODORSADomainValidationSecureServerCA.crt'),
    key: fs.readFileSync('/etc/ssl/fb/SSL1.txt'),
    certificate: fs.readFileSync('/etc/ssl/fb/STAR_duoworld_com.crt')
};

var https_server = restify.createServer(https_options);*/


// Put any routing, response, etc. logic here. This allows us to define these functions
// only once, and it will be re-used on both the HTTP and HTTPs servers
var setup_server = function (RestServer) {

    restify.CORS.ALLOW_HEADERS.push('authorization');
    restify.CORS.ALLOW_HEADERS.push('api_key');
    RestServer.use(restify.CORS());
    RestServer.use(restify.fullResponse());
    RestServer.use(restify.acceptParser(RestServer.acceptable));
    RestServer.use(restify.queryParser());
    RestServer.use(restify.bodyParser());
    RestServer.use(jwt({secret: secret.Secret}));

    var hc = new healthcheck(RestServer, {redis: walletHandler.RedisConn, pg: walletHandler.pgConn});
    hc.Initiate();

    RestServer.post('/DVP/API/' + version + '/PaymentManager/Wallet/Package', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[CreateWallet] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.CreatePackage(req, res);
        }
        catch (ex) {
            logger.error('[CreateWallet] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });
    
    RestServer.get('/DVP/API/' + version + '/PaymentManager/Wallet', authorization({
        resource: "wallet",
        action: "read"
    }), function (req, res, next) {
        try {
            logger.info('[CreditBalance] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.CreditBalance(req, res);
        }
        catch (ex) {
            logger.error('[CreditBalance] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.post('/DVP/API/' + version + '/PaymentManager/Wallet', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[CreateWallet] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.CreateWallet(req, res);
        }
        catch (ex) {
            logger.error('[CreateWallet] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.post('/DVP/API/' + version + '/PaymentManager/Wallet/Lock', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[LockCreditFromCustomer] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.LockCreditFromCustomer(req, res);
        }
        catch (ex) {
            logger.error('[LockCreditFromCustomer] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.post('/DVP/API/' + version + '/PaymentManager/Wallet/Release', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[ReleaseCreditFromCustomer] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.ReleaseCreditFromCustomer(req, res);
        }
        catch (ex) {
            logger.error('[ReleaseCreditFromCustomer] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.post('/DVP/API/' + version + '/PaymentManager/Wallet/Bulk', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[CreateWalletBulk] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.CreateWalletBulk(req, res);
        }
        catch (ex) {
            logger.error('[CreateWalletBulk] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.put('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[UpdateWallet] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.UpdateWallet(req, res);
        }
        catch (ex) {
            logger.error('[UpdateWallet] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.get('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId', authorization({
        resource: "wallet",
        action: "read"
    }), function (req, res, next) {
        try {
            logger.info('[CreditBalanceById] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.CreditBalanceById(req, res);
        }
        catch (ex) {
            logger.error('[CreditBalanceById] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.get('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId/Cards', authorization({
        resource: "wallet",
        action: "read"
    }), function (req, res, next) {
        try {
            logger.info('[ListCards] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.ListCards(req, res);
        }
        catch (ex) {
            logger.error('[ListCards] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.post('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId/Credit', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[BuyCredit] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.BuyCredit(req, res);
        }
        catch (ex) {
            logger.error('[BuyCredit] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.post('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId/Credit/:cardId', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[BuyCreditFormSelectedCard] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.BuyCreditFormSelectedCard(req, res);
        }
        catch (ex) {
            logger.error('[BuyCreditFormSelectedCard] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.put('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId/Credit', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[DeductCredit] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.DeductCredit(req, res);
        }
        catch (ex) {
            logger.error('[DeductCredit] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.put('/DVP/API/' + version + '/PaymentManager/Customer/Wallet/Credit', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[DeductCreditFormCustommer] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.DeductCreditFormCustomer(req, res);
        }
        catch (ex) {
            logger.error('[DeductCreditFormCustommer] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.put('/DVP/API/' + version + '/PaymentManager/Customer/Wallet/Credit/Temp', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[DeductCreditFromTemp] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.DeductCreditFromTemp(req.body.SessionId,req.body.Reason,req.user.iss, req.user.tenant, req.user.company).then(function (val) {
                var jsonString = messageFormatter.FormatMessage(undefined, "complete", val, undefined);
                res.end(jsonString);
            }, function (error) {
                var jsonString = messageFormatter.FormatMessage(error, "complete", false, undefined);
                res.end(jsonString);
            });
        }
        catch (ex) {
            logger.error('[DeductCreditFromTemp] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.put('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId/Card', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[AddNewCard] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.AddNewCard(req, res);
        }
        catch (ex) {
            logger.error('[AddNewCard] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.del('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId/Card/:CardId', authorization({
        resource: "wallet",
        action: "delete"
    }), function (req, res, next) {
        try {
            logger.info('[RemoveCard] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.RemoveCard(req, res);
        }
        catch (ex) {
            logger.error('[RemoveCard] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

    RestServer.put('/DVP/API/' + version + '/PaymentManager/Wallet/:WalletId/Card/:CardId', authorization({
        resource: "wallet",
        action: "write"
    }), function (req, res, next) {
        try {
            logger.info('[SetDefaultCard] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.SetDefaultCard(req, res);
        }
        catch (ex) {
            logger.error('[SetDefaultCard] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

// ------------------------------------ Wallet history--- --------------------------------//

    RestServer.get('/DVP/API/' + version + '/PaymentManager/WalletHistory/:rowCount/:pageNo', authorization({
        resource: "wallet",
        action: "read"
    }), function (req, res, next) {
        try {
            logger.info('[getWalletHistory] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            walletHandler.getWalletHistory(req, res);
        }
        catch (ex) {
            logger.error('[CreditBalance] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
            res.end(jsonString);
        }
        return next();
    });

// ---------------------- webhook -------------------------------- //
    RestServer.post('/DVP/API/' + version + '/webhook', function (req, res, next) {
        try {
            logger.info('[Webhook] - [HTTP]  - Request received -  Data - %s ', JSON.stringify(req.body));
            webhookHandler.Webhook(req, res);
        }
        catch (ex) {
            logger.error('[Webhook] - [HTTP]  - Exception occurred -  Data - %s ', JSON.stringify(req.body), ex);
            res.send(200);
        }
        return next();
    });

// ---------------------- webhook -------------------------------- //


};

setup_server(http_server);

http_server.listen(port, function () {
    console.log('%s listening at %s', http_server.name, http_server.url);
});

/*setup_server(https_server);
https_server.listen(444, function () {
    console.log('%s listening at %s', https_server.name, https_server.url);
});*/
