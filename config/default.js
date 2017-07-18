module.exports = {
    "DB": {
        "Type": "postgres",
        "User": "duo",
        "Password": "DuoS123",
        "Port": 5432,
        "Host": "104.236.231.11",
        "Database": "duo"
    },
     "Redis":
  {
    "mode":"sentinel",//instance, cluster, sentinel
    "ip": "45.55.142.207",
    "port": 6389,
    "user": "duo",
    "password": "DuoS123",
    "sentinels":{
      "hosts": "138.197.90.92,45.55.205.92,138.197.90.92",
      "port":16389,
      "name":"redis-cluster"
    }

  },

  "Security":
  {

    "ip" : "45.55.142.207",
    "port": 6389,
    "user": "duo",
    "password": "DuoS123",
    "mode":"sentinel",//instance, cluster, sentinel
    "sentinels":{
      "hosts": "138.197.90.92,45.55.205.92,138.197.90.92",
      "port":16389,
      "name":"redis-cluster"
    }
  },

    "Host": {
        "domain": "0.0.0.0",
        "port": 3333,
        "version": "1.0.0.0",
        "hostpath": "./config",
        "logfilepath": ""
    },
    
    "RabbitMQ":
    {
        "ip": "45.55.142.207",
        "port": 5672,
        "user": "guest",
        "password": "guest"
    },

    "Services": {

        "limitServiceHost": "192.168.0.54",
        "limitServicePort": 8084,
        "limitServiceVersion": "6.0",
        "trunkServiceHost": "192.168.0.89",
        "trunkServicePort":9898 ,
        "trunkServiceVersion": "1.0.0.0",
        "voxboneUrl": "https://sandbox.voxbone.com/ws-voxbone/services/rest"

    }
};

