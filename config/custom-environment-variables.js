module.exports = {
 "DB": {
    "Type":"SYS_DATABASE_TYPE",
    "User":"SYS_DATABASE_POSTGRES_USER",
    "Password":"SYS_DATABASE_POSTGRES_PASSWORD",
    "Port":"SYS_SQL_PORT",
    "Host":"SYS_DATABASE_HOST",
    "Database":"SYS_DATABASE_POSTGRES_USER"
  },
    "Host":
    {
        "domain": "HOST_NAME",
        "port": "HOST_WALLETSERVICE_PORT",
        "version": "HOST_VERSION",
        "hostpath":"HOST_PATH",
        "logfilepath": "LOG4JS_CONFIG"
    },
	
	
    "Redis":
    {
        "mode":"SYS_REDIS_MODE",
        "ip": "SYS_REDIS_HOST",
        "port": "SYS_REDIS_PORT",
        "user": "SYS_REDIS_USER",
        "password": "SYS_REDIS_PASSWORD",
        "sentinels":{
            "hosts": "SYS_REDIS_SENTINEL_HOSTS",
            "port":"SYS_REDIS_SENTINEL_PORT",
            "name":"SYS_REDIS_SENTINEL_NAME"
        }

    },

    "Security":
    {

        "ip": "SYS_REDIS_HOST",
        "port": "SYS_REDIS_PORT",
        "user": "SYS_REDIS_USER",
        "password": "SYS_REDIS_PASSWORD",
        "mode":"SYS_REDIS_MODE",
        "sentinels":{
            "hosts": "SYS_REDIS_SENTINEL_HOSTS",
            "port":"SYS_REDIS_SENTINEL_PORT",
            "name":"SYS_REDIS_SENTINEL_NAME"
        }

    },

   "RabbitMQ":
    {
        "ip": "SYS_RABBITMQ_HOST",
        "port": "SYS_RABBITMQ_PORT",
        "user": "SYS_RABBITMQ_USER",
        "password": "SYS_RABBITMQ_PASSWORD"
    },
	
    "Services": {

        "limitServiceHost": "SYS_LIMITSERVICE_HOST",
        "limitServicePort": "SYS_LIMITSERVICE_PORT",
        "limitServiceVersion": "SYS_LIMITSERVICE_VERSION",
        "trunkServiceHost": "SYS_PHONENUMBERTRUNK_HOST",
        "trunkServicePort": "SYS_PHONENUMBERTRUNKE_PORT",
        "trunkServiceVersion": "SYS_PHONENUMBERTRUNK_VERSION",
        "voxboneUrl":"SYS_VOXBONE_URL",
    }

};



