const kafka = require('kafka-node')
const BaseService = require('./baseService');

let kafkaServiceInstance = null

class KafkaService extends BaseService {

  constructor() {
    super();
  }

  setup() {
    this.client = this.createClient();
    this.producer = new kafka.Producer(this.client)

    return new Promise((resolve, reject) => {
      this.client.on('ready', () => {
        resolve('Kafka client is connected and ready!')
      })

      this.client.on('error', (error) => {
        reject('Kafka client failed to connect!');
      })
    });
  }

  createClient() {
    const kafkaServer = process.env.KAFKA_BROKER ? process.env.KAFKA_BROKER : 'kafka-broker';
    const kafkaPort = process.env.KAFKA_PORT ? process.env.KAFKA_PORT : '9092';

    return new kafka.KafkaClient({
      kafkaHost: `${kafkaServer}:${kafkaPort}`,
      autoConnect: true
    });
  }
}

module.exports = {
  getKafkaServiceInstance: () => {
    if (!kafkaServiceInstance) {
      console.log("Started Kafka config!")
      kafkaServiceInstance = new KafkaService()
      return kafkaServiceInstance.setup();
    }
    return kafkaServiceInstance
  }
}