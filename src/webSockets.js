const fb = require("./facebook");
const { userTypes, meditationRoomStatus } = require("./types");
const { getCassandraServiceInstance } = require('./services/cassandraService');
const { getKafkaServiceInstance } = require('./services/kafkaService');
const { getMeditationRoomServiceInstance } = require('./services/meditationRoomService');

module.exports = function(io) {

    const cassandraClient = getCassandraServiceInstance().client
    const kafkaProducer = getKafkaServiceInstance().producer;
    const meditationRoomService = getMeditationRoomServiceInstance().client;

    io.on('connection', function(socket) {
        console.log('User connected'); 
        console.log(socket.handshake.query);
        
        socket.emit('authenticate');
    
        socket.on('authenticate', function(data) {
            fb.isTokenValid(data.TokenString, data.UserType).then(fbUser => {
                socket.emit('authenticated');
        
                if (fbUser.userType === userTypes.INSTRUCTOR) {
                    socket.on('create-meditation-room', function(data) {
                        meditationRoomService.createRoom(fbUser.user_id, Number(data.NumberOfStudents))
                        .then(() => socket.emit('created-meditation-room'));
                    });
        
                    socket.on('check-meditation-room-status', function() {
                        meditationRoomService.getRoom(fbUser.user_id)
                        .then(room => {
                            if (room.status === meditationRoomStatus.WAITING_FOR_STUDENTS) {
                                socket.emit('meditation-room-not-full');
                            } else {
                                socket.on('get-students-data', function() {
                                    meditationRoomService.getRoom(fbUser.user_id).then(room => {
                                        if (room.students.length === 0) {
                                            return socket.emit('instructor-left-room')
                                        }

                                        const query = 'SELECT * FROM users WHERE userId IN ? AND type = ?';
                                        const params = [ room.students, userTypes.STUDENT ];
                        
                                        return cassandraClient.execute(query, params, { prepare: true });

                                    }).then(result => {
                                        const users = result.rows;
                                        const queries = users.map(user => {
                                            const query = 'SELECT * FROM user_instructions_eeg_data WHERE userId = ? ORDER BY pk DESC LIMIT ?';
                                            const params = [ user.userid, 1 ];
                        
                                            return cassandraClient.execute(query, params, { prepare: true })
                                        });
                                        
                                        return Promise.all(queries).then(results => {
                                            socket.emit('got-student-data', {
                                                users: results.map(result => {
                                                    if (result.rows.length === 0) {
                                                        return {
                                                            userId: "Loading...",
                                                            name:  "Loading...",
                                                            predictedLabels: {
                                                                RandomForest: "Loading...",
                                                                MLPerceptron: "Loading...",
                                                                NaiveBayes: "Loading..."
                                                            }
                                                        }
                                                    }
                                                    const userInstructionsEegData = result.rows[0];
                                                    const user = users.find(user => user.userid === userInstructionsEegData.userid)
                                                    console.log({
                                                        userId: user.userid,
                                                        name: user.name,
                                                        predictedLabels: userInstructionsEegData.predictedlabels
                                                    })
                                                    return {
                                                        userId: user.userid,
                                                        name: user.name,
                                                        predictedLabels: userInstructionsEegData.predictedlabels
                                                    }
                                                })
                                            })
                                        });
                                    }).catch(err => {
                                        console.log("Could not find users / eeg instruction data: ", err);
                                        socket.emit('instructor-left-room')
                                    });
                                });

                                socket.emit('meditation-room-is-full', {
                                    agoraIoVoiceKey: process.env.AGORA_IO_VOICE_KEY,
                                    roomId: room.roomid
                                });
                            }
                        }).catch((err) => {
                            console.log("Could not check room status, it no longer exists. Error: ", err)
                            socket.disconnect(0);
                        });
                    });
        
                    socket.on('disconnect', function(){
                        meditationRoomService.removeRoom(fbUser.user_id);
                        console.log('Instructor disconnected from room');
                        socket.disconnect(0);
                    });
                }
        
                else if (fbUser.userType === userTypes.STUDENT) {

                    // Instructed Meditation Room -> After Calibration
                    socket.on('find-instruction-room', function() {
                        meditationRoomService.findVacantRoom().then(room => {
                            meditationRoomService.addStudentToRoom(fbUser.user_id, room.roomid).then(() => {
                                socket.emit('joined-instruction-room');

                                socket.on('check-if-instructor-is-ready', function() {
                                    meditationRoomService.getRoom(room.roomid).then(room => {
                                        if (room.status === meditationRoomStatus.CLASS_STARTED) {
                                            socket.emit('instruction-started', {
                                                agoraIoVoiceKey: process.env.AGORA_IO_VOICE_KEY,
                                                roomId: room.roomid
                                            });
                                        } else {
                                            socket.emit('instruction-did-not-start');
                                        }
                                    }).catch(() => {
                                        console.log("Room " + room.roomid + " no longer exists. Instructor left room!")
                                        socket.emit('instructor-left-room');
                                    });
                                });

                                socket.on('eeg-instruction-data', function(eegData) {
                                    meditationRoomService.getRoom(room.roomid).then(() => {
                                        const kafkaTopic = process.env.KAFKA_INSTRUCTION_TOPIC;
                                
                                        eegData.userId = fbUser.user_id;
                                        eegData.DataPacketValue = eegData.DataPacketValue.map(dataPacketValue => String(dataPacketValue));
                                        const message = JSON.stringify(eegData);
                                                
                                        //new Promise(function(resolve, reject) {
                                            kafkaProducer.send([
                                                { topic: kafkaTopic, partition: 0, messages: [message], attributes: 0 }
                                            ], (err, result) => {
                                                if (err) console.log(err);
                                                //else resolve("Saved to kafka!")
                                            });
                                        //});
                                    }).catch(() => {
                                        console.log("Instructor " + fbUser.user_id + " left room " + room.roomid)
                                        socket.emit('instructor-left-room');
                                    });
                                });

                                socket.on('disconnect', function(){
                                    meditationRoomService.removeStudentFromRoom(fbUser.user_id, room.roomid);
                                    console.log('Student disconnected from room');
                                    socket.disconnect(0);
                                });
                            }).catch(() => {
                                socket.emit('could-not-find-instruction-room');
                            })
                        }).catch(() => {
                            socket.emit('could-not-find-instruction-room');
                        })

                    });

                    // Calibration Room
                    socket.on('eeg-calibration-start', function() {

                        const calibrationId = String(Date.now() + Math.random());
                        const query = 'INSERT INTO user_calibrations (calibrationId, userId, startDate, modelsGenerated) VALUES (?, ?, ?, ?)';
                        const params = [ calibrationId, fbUser.user_id, new Date(), false ];
        
                        cassandraClient.execute(query, params, { prepare: true })
                        .then(result => {
                            console.log('Created user_calibrations entry!')
                            socket.emit('eeg-calibration-started');

                            socket.on('eeg-calibration-data', function(eegData) {
                                console.log("EEG data: ", eegData);
                                
                                // Eeg[]{Eeg.EEG1, Eeg.EEG2, Eeg.EEG3, Eeg.EEG4, Eeg.AUX_LEFT, Eeg.AUX_RIGHT};
                                // http://android.choosemuse.com/enumcom_1_1choosemuse_1_1libmuse_1_1_eeg.html#aff197d94f2fe3089df08314495b461d8
                                const kafkaTopic = process.env.KAFKA_CALIBRATION_TOPIC;
                
                                eegData.userId = fbUser.user_id;
                                eegData.calibrationId = calibrationId;
                                eegData.DataPacketValue = eegData.DataPacketValue.map(dataPacketValue => String(dataPacketValue));
                                const message = JSON.stringify(eegData);
                                
                                //new Promise(function(resolve, reject) {
                                    kafkaProducer.send([
                                        { topic: kafkaTopic, partition: 0, messages: [message], attributes: 0 }
                                    ], (err, result) => {
                                        if (err) console.log(err);
                                        //else resolve("Saved to kafka!")
                                    });
                                //});
                            });

                            socket.on('eeg-calibration-end', function(){
                                const query = 'UPDATE user_calibrations SET endDate = ? WHERE calibrationId = ?';
                                const params = [ new Date(), calibrationId ];
            
                                cassandraClient.execute(query, params, { prepare: true })
                                .then(result => {
                                    console.log("Finished calibration!")
                                    socket.emit('eeg-calibration-done');
                                }).catch(err => {
                                    console.log("Database error: ", err)
                                });
                            });

                        }).catch(err => {
                            console.log("Database error: ", err)
                        });
                    });
                }
            }).catch(err => {
                socket.disconnect(0);
            });
        });
        
        socket.on('error', function(msg){
            console.log('Error message: ' + msg);
        });
        
        socket.on('close', function(msg) { 
            console.log('Close message: ' + msg);
        });
        
        socket.on('disconnect', function(){
            console.log('User disconnected');
        });
    });
}