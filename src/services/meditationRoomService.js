const BaseService = require('./baseService');
const { getCassandraServiceInstance } = require('./cassandraService');
const { meditationRoomStatus } = require("../types");

let meditationRoomService = null

class MeditationRoomService extends BaseService {

    constructor() {
        super();
    }

    setup() {

        const cassandraClient = getCassandraServiceInstance().client

        this.client = {
            getRoom(roomId) {
                const query = 'SELECT * FROM meditation_rooms WHERE roomId = ?';
                const params = [ roomId ];

                return cassandraClient.execute(query, params, { prepare: true })
                .then(result => {
                    if (!result.rows[0])
                        throw "Room does not exist!"
                    return result.rows[0]
                })
            },
            findVacantRoom() {
                const query = 'SELECT * FROM meditation_rooms WHERE status = ?';
                const params = [ meditationRoomStatus.WAITING_FOR_STUDENTS ];

                return cassandraClient.execute(query, params, { prepare: true })
                .then(result => {
                    const room = result.rows.find(meditationRoom => {
                        return meditationRoom.students === null || 
                         meditationRoom.students.length < Number(meditationRoom.size.toString());
                    })
                    if (!room)
                        throw "Could not find a vacant room!";
                    return room;
                })
            },
            createRoom(roomId, size) {
                const query = 'INSERT INTO meditation_rooms (roomId, students, size, status) VALUES (?, ?, ?, ?)';
                const params = [ roomId, [], size, meditationRoomStatus.WAITING_FOR_STUDENTS ];

                return cassandraClient.execute(query, params, { prepare: true })
                .then(result => result)
                .catch(err => {
                    console.log("Room " + roomId + " failed to create!")
                });
            },
            removeRoom(roomId) {
                const query = 'DELETE FROM meditation_rooms WHERE roomId = ?';
                const params = [ roomId ];

                return cassandraClient.execute(query, params, { prepare: true })
                .then(() => {
                    console.log("Room " + roomId + " removed!" )
                })
                .catch(err => {
                    console.log("Room " + roomId + " failed to delete!")
                });
            },
            removeStudentFromRoom(studentId, roomId) {
                return this.getRoom(roomId).then(room => {
                    room.students = room.students.filter(student => student !== studentId)

                    const query = 'UPDATE meditation_rooms SET students = ? WHERE roomId = ?';
                    const params = [ room.students, roomId ];

                    return cassandraClient.execute(query, params, { prepare: true });
                }).then(() => {
                    console.log("Student " + studentId + " removed from room " + roomId )
                }).catch(err => {
                    console.log("Room " + roomId +  " does not exists, cannot remove student " + studentId) 
                });
            },
            addStudentToRoom(studentId, roomId) {
                return this.getRoom(roomId).then(room => {
                    if (!room.students) {
                        room.students = []
                    }
                    room.students.push(studentId);

                    let status = meditationRoomStatus.WAITING_FOR_STUDENTS;

                    if (room.students.length === Number(room.size.toString())) {
                        status = meditationRoomStatus.CLASS_STARTED;
                    }

                    const query = 'UPDATE meditation_rooms SET students = ?, status = ? WHERE roomId = ?';
                    const params = [ room.students, status, roomId ];

                    return cassandraClient.execute(query, params, { prepare: true });
                
                }).then(() => {
                    console.log("Room " + roomId +  " added new student " + studentId)
                }).catch(err => {
                    console.log("Room " + roomId +  " does not exists, cannot add student " + studentId)
                });
            }
        }

        return this;

    }
}

module.exports = {
  getMeditationRoomServiceInstance: () => {
    if (!meditationRoomService) {
      console.log("Started Meditation Room config!")
      meditationRoomService = new MeditationRoomService()
      return meditationRoomService.setup();
    }
    return meditationRoomService
  }
}