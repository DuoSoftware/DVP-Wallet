/**
 * Created by Rajinda on 11/16/2016.
 */

var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var DbConn = require('dvp-dbmodels');
var moment = require('moment');
var Q = require('q');
var stripe = require("stripe")("sk_test_36ABwTvXB7oQbJ9704znf0m5");

module.exports.DirectPayment = function (data,res) {

    /*stripe.customers.create({
     email: 'foo-customer@example.com'
     }).then(function(customer){
     return stripe.customers.createSource(customer.id, {
     object: 'card',
     exp_month: 10,
     exp_year: 2018,
     number: '4242 4242 4242 4242',
     cvc: 100
     });
     }).then(function(source) {
     return stripe.charges.create({
     amount: 1600,
     currency: 'usd',
     customer: source.customer
     });
     }).then(function(charge) {
     // New charge created on a new customer
     }).catch(function(err) {
     // Deal with an error
     });*/

    stripe.customers.create({
        source: data.token.id,
        description: data.Description
    }, function(err, customer) {
        // asynchronously called
    });

    /*stripe.customers.create({
     source: data.token.id,
     description: data.Description
     }).then(function(customer) {
     return stripe.charges.create({
     amount: data.amount,
     currency: data.currency,
     customer: customer.id
     });
     }).then(function(charge) {

     var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, charge);
     logger.info('DirectPayment - Payment Done. - [%s] .', jsonString);
     res.end(jsonString);
     });*/

};

module.exports.DeleteCustomer = function (data) {
    var deferred = Q.defer();

    stripe.customers.del(
        data.customerId,
        function(err, confirmation) {
            if(err){
                deferred.reject(err);
            }else{
                deferred.resolve(confirmation);
            }
        }
    );
    return deferred.promise;
};

module.exports.CustomerRegister = function (token,data) {
    var deferred = Q.defer();

    stripe.customers.create({
        source: token,
        description: data.Description
    }, function(err, customer) {
        if(err){
            deferred.reject(err);
        }else{
            deferred.resolve(customer);
        }
    });
    return deferred.promise;
};

module.exports.BuyCredit = function (wallet,amount) {
    var deferred = Q.defer();

    stripe.charges.create({
        amount: amount,
        currency: wallet.CurrencyISO,
        /*source: "tok_19BJuLCCnSnmdYUwfhX4Q9OQ", // obtained with Stripe.js*/
        customer: wallet.StripeId, // Previously stored, then retrieved
        description: "Buy Credit For Facetone"
    }, function(err, charge) {
        if(err){
            deferred.reject(err);
        }else{
            deferred.resolve(charge);
        }
    });
    return deferred.promise;
};

module.exports.AddNewCard = function (customerId,token) {
    var deferred = Q.defer();

    stripe.customers.createSource(
        customerId,
        {source: token},
        function(err, card) {
            if(err){
                deferred.reject(err);
            }else{
                deferred.resolve(card);
            }
        }
    );

    return deferred.promise;
};

module.exports.DeleteCard = function (customerId,cardId) {
    var deferred = Q.defer();

    stripe.customers.deleteCard(
        customerId,
        cardId,
        function(err, confirmation) {
            if(err){
                deferred.reject(err);
            }else{
                deferred.resolve(confirmation);
            }
        }
    );

    return deferred.promise;
};

module.exports.SetDefaultCard = function (customerId,cardId) {
    var deferred = Q.defer();

    stripe.customers.update(customerId, {
        description: "Update Default Card",
        default_source:cardId
    }, function(err, customer) {
        if(err){
            deferred.reject(err);
        }else{
            deferred.resolve(customer);
        }
    });

    return deferred.promise;
};


module.exports.ListCards = function (customerId) {
    var deferred = Q.defer();

    stripe.customers.listCards(customerId, function(err, cards) {
        if(err){
            deferred.reject(err);
        }else{
            deferred.resolve(cards);
        }
    });


    return deferred.promise;
};