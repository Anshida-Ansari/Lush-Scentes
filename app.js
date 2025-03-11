const express = require('express')
const app=express()
const path=require('path')
const session=require('express-session')
const passport=require('./config/passport')
const env= require('dotenv').config()
const userRouter=require('./routes/userRouter')
const adminRouter=require('./routes/adminRouter')
const db= require('./config/db')
const User = require('./models/userSchema.js')
const cloudinary = require('./config/cloudinary.js')
const errorHandling = require('./middlewares/errorHandling.js')

db()

app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000

    }
}))

app.use(passport.initialize())
app.use(passport.session())




app.use((req,res,next)=>{
    res.locals.user = req.session.user
    next()
})


app.set("view engine", "ejs");
app.set("views", [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')])
app.use(express.static(path.join(__dirname, "./public")));
  app.use(async (req, res, next) => {
    try {
        if (req.session.user) {
            if (typeof req.session.user === 'string' || !req.session.user.name) {
                const userData = await User.findById(
                    typeof req.session.user === 'string' ? req.session.user : req.session.user._id
                )
                if (userData) {
                    req.session.user = {
                        _id: userData._id,
                        name: userData.name
                    }
                }
            }
            res.locals.user = req.session.user
        }
        next()
    } catch (error) {
        console.error('Middleware error:', error)
        next()
    }
})



app.use((req,res,next)=>{
    res.set('cache-control','no-store')
    next()
})


app.use('/',userRouter)
app.use('/admin',adminRouter)

app.use(errorHandling)

app.listen(process.env.PORT,()=>{
    console.log('server is running');
    
})

module.exports= app