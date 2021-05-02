FROM node:7.7.1
MAINTAINER Daniel Marchena <danielmapar@gmail.com>

ENV FB_STUDENT_APP_ID 614882468961582
ENV FB_STUDENT_APP_SECRET fef3198085afd6db780566ca155cdb6d
ENV FB_INSTRUCTOR_APP_ID 419052118866882
ENV FB_INSTRUCTOR_APP_SECRET 4ad125fa5e837b111cbccec7e9e4b800
ENV DB_DATACENTER datacenter1
ENV DB_HOST match-making-db
ENV DB_USERNAME match_making_user
ENV DB_PASSWORD match_making_pw
ENV KEYSPACE_NAME match_making
ENV DB_PORT 9042
ENV API_PORT 3000
ENV KAFKA_BROKER kafka-broker
ENV KAFKA_PORT 9092
ENV KAFKA_TOPIC eeg
ENV KAFKA_DEBUG true

# Create/Set the working directory
RUN mkdir /app
WORKDIR /app

# Copy App
COPY . /app

COPY package.json /app/package.json
RUN npm install

# Set Entrypoint
ENTRYPOINT chmod 777 ./wait-for-it.sh && ./wait-for-it.sh -t 120 match-making-db:9042 && sleep 60 && npm run start