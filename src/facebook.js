const rp = require('request-promise');
const { userTypes } = require("./types");

module.exports = {
    isTokenValid: function(inputToken, userType) {
        let accessToken = "";
        if (userType === userTypes.STUDENT) {
            accessToken = `${process.env.FB_STUDENT_APP_ID}|${process.env.FB_STUDENT_APP_SECRET}`
        } else if (userType === userTypes.INSTRUCTOR) {
            accessToken = `${process.env.FB_INSTRUCTOR_APP_ID}|${process.env.FB_INSTRUCTOR_APP_SECRET}`
        } else {
            return new Promise((_, reject) => {
                reject("Not a valid user type");
            })
        }

        return rp({
            uri: `https://graph.facebook.com/debug_token`,
            qs: {
            input_token: inputToken, // -> uri + '?input_token=xxxxx%20xxxxx'
            access_token: accessToken
            },
            headers: {
                'User-Agent': 'Request-Promise'
            },
            json: true // Automatically parses the JSON string in the response
        })
        .then(function(validation) { 
            if (validation.data && validation.data.error && validation.data.error.message) {
                throw validation.data;
            }
            const userData = validation.data;
            userData.accessToken = accessToken;
            userData.userType = userType;

            return rp({
                uri: `https://graph.facebook.com/v3.2/${userData.user_id}`,
                qs: {
                    access_token: accessToken
                },
                headers: {
                    'User-Agent': 'Request-Promise'
                },
                json: true // Automatically parses the JSON string in the response
            }).then(function(user) {
                userData.name = user.name;
                return userData;
            }); 
        })
        .catch(function(ret) {
            throw ret.error.message;
        });  
    }
};
    