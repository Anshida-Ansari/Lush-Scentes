const User = require('../models/userSchema')


const userAuth = async(req,res,next)=>{
    if(req.session.user){
        next()
    }else{
        return res.redirect('/login')
    }
}

const userLogin=async(req,res,next)=>{
    if(!req.session.user){
        next()

    }else{
        return res.redirect('/')
    }
}

module.exports={userAuth,userLogin}