const mongoose = require('mongoose')
const env = require('dotenv').config()


const connectDB = async () => {
    try {
 
      let conn =  await mongoose.connect(process.env.MONGODB_URI)
      console.log("db",conn.connection.host)
      console.log("dbname",conn.connection.name)
      console.log("MongoDB URI:", process.env.MONGODB_URI);
   
        console.log('DB connected');

    } catch (error) {
        console.log('DB connected error', error.message);
        process.exit(1)
    }
}
 
module.exports = connectDB