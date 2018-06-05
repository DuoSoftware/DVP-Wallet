module.exports = {
    "DB": {
        "Type": "postgres",
        "User": "",
        "Password": "",
        "Port": 5432,
        "Host": "",
        "Database": ""
    },
    "Redis": {
        "mode": "sentinel",//instance, cluster, sentinel
        "ip": "",
        "port": 6389,
        "user": "",
        "db": 0,
        "password": "",
        "ttl": 30000,
        "sentinels": {
            "hosts": "",
            "port": 16389,
            "name": "redis-cluster"
        }

    },

    "Security": {

        "ip": "",
        "port": 6389,
        "user": "",
        "password": "",
        "mode": "sentinel",//instance, cluster, sentinel
        "sentinels": {
            "hosts": "",
            "port": 16389,
            "name": "redis-cluster"
        }
    },

    "Host": {
        "domain": "0.0.0.0",
        "port": 3333,
        "version": "1.0.0.0",
        "hostpath": "./config",
        "logfilepath": ""
    },

    "RabbitMQ": {
        "ip": "",
        "port": 5672,
        "user": "",
        "password": ""
    },

    "Services": {

        "limitServiceHost": "",
        "limitServicePort": 8084,
        "limitServiceVersion": "6.0",
        "trunkServiceHost": "192.168.0.89",
        "trunkServicePort": 9898,
        "trunkServiceVersion": "1.0.0.0",
        "voxboneUrl": ""

    }
};

