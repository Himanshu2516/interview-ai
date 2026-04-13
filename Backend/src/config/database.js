const mongoose = require("mongoose");

async function ConnectToDB(){
    try{
        await mongoose.connect(process.env.MONGO_URI);

        console.log("connected to MongoDB");
    }
    catch(err){
        console.log(err);
    }
    
}

module.exports = ConnectToDB;