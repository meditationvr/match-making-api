const { getKafkaServiceInstance } = require('./kafkaService')
const { getCassandraServiceInstance } = require('./cassandraService')

function loadServices() {
  return Promise.all([
    getKafkaServiceInstance(),
    getCassandraServiceInstance()
  ])
}

module.exports = loadServices;