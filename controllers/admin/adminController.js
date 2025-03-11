const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const pageerror = async (req, res) => {
    res.render('admin-error')
}

const loadLogin = (req, res) => {


    if (req.session.admin) {
        return res.redirect('/admin/dashboard')
    } return res.render('Admin-login', { message: null })
}


const login = async (req, res) => {
    try {

        const { email, password } = req.body
        console.log(email);

        const admin = await User.findOne({ email, isAdmin: true })
        console.log('found', admin);

        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password)
            console.log('password is match', passwordMatch);

            if (passwordMatch) {
                req.session.admin = true
                console.log('session:', req.session);

                return res.redirect('/admin/dashboard')
            } else {
                console.log('pass wrong');

                return res.render('Admin-login', { message: 'Invalid password' })
            }
        } else {
            console.log('admin is not found');
            return res.render('Admin-login', { message: 'Admin not found' });
        }


    } catch (error) {

        console.log('login error', error);
        return res.redirect('/pageerror')


    }
}

const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {

            res.render('dashboard')

        } catch (error) {

            res.redirect('/pageerror')

        }
    }
}


const logout = async (req, res) => {
    try {

        req.session.destroy(err => {
            if (err) {
                console.log('Error destroying session', err);
                return res.redirect('/pageerror')
            } else {
                res.redirect('/admin/login')
            }
        })

    } catch (error) {

        console.log('unexpected error during logout', error);
        res.redirect('/pageerror')


    }
}






module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,
}
