const cassandra = require('cassandra-driver');
const BaseService = require('./baseService');

let cassandraServiceInstance = null

class CassandraService extends BaseService {

    constructor() {
        super();
    }

    connectToCassandraDB(cassandraClient) {
        return cassandraClient.connect() 
        .then(function () {
            return cassandraClient.execute('SELECT * FROM system.local');
        }) 
        .catch(function (err) {
            console.error('There was an error when connecting', err);
            return cassandraClient.shutdown().then(() => { 
                return this.connectToCassandraDB(cassandraClient) 
            });
        }); 
    }

    setup() {

        const authProvider = new cassandra.auth.PlainTextAuthProvider(process.env.DB_USERNAME, process.env.DB_PASSWORD);

        this.client = new cassandra.Client({ 
            contactPoints: [process.env.DB_HOST], 
            localDataCenter: process.env.DB_DATACENTER, 
            authProvider: authProvider, 
            keyspace: process.env.KEYSPACE_NAME
        });

        return this.connectToCassandraDB(this.client).then(() => {
            return "Cassandra Cluster Connected!"
        })
        .catch(function (err) {
            return "Failed to connect to Cassandra Cluster!"
        }); 
    }
}

module.exports = {
  getCassandraServiceInstance: () => {
    if (!cassandraServiceInstance) {
      console.log("Started Cassandra config!")
      cassandraServiceInstance = new CassandraService()
      return cassandraServiceInstance.setup();
    }
    return cassandraServiceInstance
  }
}