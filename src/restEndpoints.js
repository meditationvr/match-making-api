const bodyParser = require('body-parser');
const { check, validationResult } = require('express-validator/check');
const fb = require("./facebook");
const { getCassandraServiceInstance } = require('./services/cassandraService');
const { userTypes } = require("./types");

module.exports = function(app) {

    const cassandraClient = getCassandraServiceInstance().client

    // parse application/json
    app.use(bodyParser.json());

    app.get('/', function(req, res){
        res.send('<h1>Meditation VR - Match Making API</h1>');
    });
    
    app.get('/api/health', function(req, res){
        res.status(200).send();
    });

    app.post('/api/hasCalibration', [
        check('TokenString').exists()
    ], function(req, res) { 
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        const fbAccessToken = req.body.TokenString;

        fb.isTokenValid(fbAccessToken, userTypes.STUDENT)
        .then(fbUser => {
            const query = `SELECT endDate, modelsGenerated FROM user_calibrations WHERE userId=?`; 
            const params = [
                String(fbUser.user_id) 
            ];
            cassandraClient.execute(query, params, { prepare: true })
            .then(result => {
                if (result.rows.length === 0 || result.rows.filter(row => row.enddate && row.modelsgenerated).length === 0)
                    res.status(400).send()
                else
                    res.status(200).send();
            }).catch(err => {
                console.log("err: ", err)
                res.status(400).send()
            });
        })
        .catch(err => {
            console.log("Error: ", err)
            res.status(400).send()
        });
    });
    
    app.post('/api/updateUser', [
        check('TokenString').exists(),
        check('UserType').exists()
    ], function(req, res) { 
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }
        const fbAccessToken = req.body.TokenString;
        const userType = req.body.UserType;

        if (userType !== "Instructor" && userType !== "Student") {
            return res.status(422).json({ errors: errors.array() });
        }
    
        fb.isTokenValid(fbAccessToken, userType)
        .then((fbUser) => {
            console.log(fbUser)
            const query = `UPDATE users SET 
                accessToken = ?, 
                accessTokenExpirationTime = ?,
                permissions = ?,
                name = ? 
                WHERE userId=? AND type=?`;
            const params = [ 
                String(fbUser.accessToken),
                String(fbUser.expires_at), 
                fbUser.scopes,
                String(fbUser.name),
                String(fbUser.user_id),
                userType
            ];
            cassandraClient.execute(query, params, { prepare: true })
            .then(result => {
                console.log('User updated on the cluster')
                res.status(200).send();
            })
            .catch(err => {
                console.log("Database error: ", err)
                res.status(400).send()
            });
        }).catch(err => {
            console.log("Error: ", err)
            res.status(400).send()
        });
    });
}