/**
 * Created by Rajinda on 11/16/2016.
 */
var messageFormatter = require("dvp-common-lite/CommonMessageGenerator/ClientMessageJsonFormatter.js");
var logger = require("dvp-common-lite/LogHandler/CommonLogHandler.js").logger;
var DbConn = require("dvp-dbmodels");
var moment = require("moment");
var Sequelize = require("sequelize");
var subscriptionsHandler = require("./SubscriptionsHandler");

module.exports.Webhook = function (req, res) {
  subscriptionsHandler.ValidatWebhook(res, function (err, event) {
    req.send(200);
  });
};
