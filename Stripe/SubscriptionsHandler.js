/**
 * Created by Rajinda on 8/24/2015.
 */

var messageFormatter = require("dvp-common-lite/CommonMessageGenerator/ClientMessageJsonFormatter.js");
var request = require("request");
var logger = require("dvp-common-lite/LogHandler/CommonLogHandler.js").logger;

var format = require("string-format");
var config = require("config");
var xpath = require("xpath");
var dom = require("xmldom").DOMParser;
var dbHandler = require("./../DbHandler");

var stripe = require("stripe")("");

module.exports.CreatePlan = function (req, res) {
  var data = req.body.Plan;
  stripe.plans.create(
    {
      amount: data.amount,
      interval: data.interval,
      name: data.name,
      currency: data.currency,
      id: data.id,
    },
    function (err, plan) {
      if (err) {
        var jsonString = messageFormatter.FormatMessage(
          err,
          "EXCEPTION",
          false,
          undefined
        );
        logger.error(
          "CreatePlan - Fail To Create Subscription Plan - [%s] .",
          jsonString
        );
      } else {
        var jsonString = messageFormatter.FormatMessage(
          undefined,
          "EXCEPTION",
          true,
          plan
        );
        logger.info(
          "CreatePlan - Subscription Plan Created - [%s] .",
          jsonString
        );
        res.end(jsonString);
      }
    }
  );
};

/*Subscribe a customer to a plan*/
module.exports.SubscribeCustomerPlan = function (req, res) {
  var token = req.header("api_key");
  var data = req.body.Plan;
  stripe.customers.create(
    {
      source: token,
      plan: data.plan,
      email: data.email,
    },
    function (err, customer) {
      if (err) {
        var jsonString = messageFormatter.FormatMessage(
          err,
          "EXCEPTION",
          false,
          undefined
        );
        logger.error(
          "SubscribeCustomerPlan - Fail To Add Plan To Customer - [%s] .",
          jsonString
        );
      } else {
        dbHandler.CreateCustomer(req, customer, function (err, obj) {
          if (err) {
            var jsonString = messageFormatter.FormatMessage(
              err,
              "EXCEPTION",
              true,
              customer
            );
            logger.error(
              "SubscribeCustomerPlan - Subscribe To Plan, but Fail to Save Data - [%s] .",
              jsonString
            );
            res.end(jsonString);
          } else {
            var jsonString = messageFormatter.FormatMessage(
              undefined,
              "EXCEPTION",
              true,
              obj
            );
            logger.info(
              "SubscribeCustomerPlan - Subscribe To Plan - [%s] .",
              jsonString
            );
            res.end(jsonString);
          }
        });
      }
    }
  );
};

/*module.exports.AddNewSubscriptionExistingCustomer = function (req,res) {

    var data = req.body.Plan;
    stripe.subscriptions.create({
        customer: data.customer,
        plan: data.plan
    }, function(err, subscription) {
        if(err){
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('AddNewSubscriptionExistingCustomer - Fail To Add New Subscription Plan - [%s] .', jsonString);
        }else{
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, subscription);
            logger.error('AddNewSubscriptionExistingCustomer - Subscription Plan Added - [%s] .', jsonString);
            res.end(jsonString);
        }
    });
};*/

// need to validate process
module.exports.UpdateCustomerSubscription = function (req, res) {
  var data = req.body.Plan;
  stripe.subscriptions.update(
    data.subscriptionId,
    {
      plan: data.plan,
      prorate: false /*With proration disabled, the customer will be billed the full amount for the new plan when the next invoice is generated.*/,
    },
    function (err, subscription) {
      if (err) {
        var jsonString = messageFormatter.FormatMessage(
          err,
          "EXCEPTION",
          false,
          undefined
        );
        logger.error(
          "UpdateCustomerSubscription - Fail To Update Subscription Plan - [%s] .",
          jsonString
        );
      } else {
        dbHandler.UpdateCustomerSubscription(req, data, subscription, function (
          err,
          obj
        ) {
          if (err) {
            var jsonString = messageFormatter.FormatMessage(
              err,
              "EXCEPTION",
              true,
              subscription
            );
            logger.error(
              "UpdateCustomerSubscription - Update Subscription Plan, but Fail to Save Data - [%s] .",
              jsonString
            );
            res.end(jsonString);
          } else {
            var jsonString = messageFormatter.FormatMessage(
              undefined,
              "EXCEPTION",
              true,
              obj
            );
            logger.info(
              "UpdateCustomerSubscription - Update Subscription Plan - [%s] .",
              jsonString
            );
            res.end(jsonString);
          }
        });
      }
    }
  );
};

module.exports.CancelCustomerSubscription = function (req, res) {
  var data = req.body.Plan;
  stripe.subscriptions.del(
    data.subscriptionId,
    { at_period_end: true },
    function (err, confirmation) {
      if (err) {
        var jsonString = messageFormatter.FormatMessage(
          err,
          "EXCEPTION",
          false,
          undefined
        );
        logger.error(
          "CancelCustomerSubscription - Fail To Cancel Subscription Plan - [%s] .",
          jsonString
        );
      } else {
        var jsonString = messageFormatter.FormatMessage(
          undefined,
          "EXCEPTION",
          true,
          confirmation
        );
        logger.info(
          "CancelCustomerSubscription - Cancel Subscription Plan - [%s] .",
          jsonString
        );
        res.end(jsonString);
      }
    }
  );
};

module.exports.ValidatWebhook = function (res, callback) {
  // Retrieve the request's body and parse it as JSON
  var event_json = JSON.parse(res.body);
  // Verify the event by fetching it from Stripe
  stripe.events.retrieve(event_json.id, function (err, event) {
    callback(err, event);
  });
};
