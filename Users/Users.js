// Load express
const express  = require("express");
const app = express()
const bodyParser = require("body-parser");
const axios = require("axios");
const opentracing = require('opentracing');
const { createTracer } = require('../tracer');

const tracer = createTracer(
	'users-service',
	'https://tempo-eu-west-0.grafana.net:443/api/traces'
  );
  

app.use(bodyParser.urlencoded({extended: true})); 
app.use(bodyParser.json()); 

// Load Mongoose
const mongoose = require("mongoose");

// Global User Object which will be the instance of MongoDB document
var User;
async function connectMongoose() {
	await mongoose.connect("mongodb://127.0.0.1:27017", { useNewUrlParser: true, useUnifiedTopology:true }).then(() =>{
		console.log("mongoose connected..")
	})
	require("./User")
	User = mongoose.model("User")
}


// Load initial modules
async function initialLoad() {
	await connectMongoose();
}

initialLoad()
/**
 * IMPROVEMENT: Each API can sit in a different file if we want to scale the application to perform larger operations
 */

// Main endpoint
app.get("/", (req, res) => {
	const parent = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);
	const span = tracer.startSpan('users.process-request', { childOf: parent });
	res.send("This is our main endpoint")
	span.finish();
})

// GET all users
app.get("/users",async (req, res) => {
	const parent = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);
	const span = tracer.startSpan('users.get-users', { childOf: parent });
	User.find().then((users) => {
		res.send(users)
		span.finish();
	}).catch((err) => {
		if(err) {
			throw err
		}
	})
	
})

// GET single user
app.get("/users/:uid",async (req, res) => {
	const parent = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);

	const span = tracer.startSpan('users.get-user-details', { childOf: parent });
	span.setTag('user-id', req.params.uid);
	User.findById(req.params.uid).then((user) => {
		if(user){
			res.json(user)
		} else {
			res.sendStatus(404)
		}
		span.finish();
	}).catch( err => {
		if(err) {
			throw err
		}
	})
	
})

// GET all orders for an user
app.get("/users/:uid/orders", async (req, res) => {
	const span = tracer.startSpan('users.get-user-orders', { childOf: parent });
	axios.get(`/orders?uid=${req.params.uid}`).then( (orders) => {
		if(orders) {
			res.send(orders)
			span.finish();
		}
	}).catch( err => {
		res.sendStatus(404).send(err)
		span.finish();
	})
	
})

// Create new user
app.post("/user", async (req, res) => {
	const parent = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);

	const span = tracer.startSpan('users.get-user-orders', { childOf: parent });
	const newUser = {
		"firstName":req.body.firstName,
		"lastName": req.body.lastName,
		"email":req.body.email,
		"phone": req.body.phone,
		"address": req.body.address,
		"orders": req.body.orders
	}
	
	// Create new User instance..
	const user = new User(newUser)
	user.save().then((r) => {
		res.send("User created..")
		span.finish();
	}).catch( (err) => {
		if(err) {
			throw err
		}
	})
	
})

// Create new order for a user
app.post("/users/:uid/order", async (req, res) => {
	const parent = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);

	const span = tracer.startSpan('users.post-user-order', { childOf: parent });
	try {
		const orderResponse = await axios.post("http://localhost:5151/order",{
			name:req.body.name,
			customerId: mongoose.Types.ObjectId(req.params.uid),
			amount:req.body.amount,
			image:req.body.image,
			createdAt:req.body.createdAt,
			qty:req.body.qty
		})
		
		if(orderResponse.status === 200) {
			User.findById(req.params.uid, (err, user) => {
				user.orders.push(orderResponse.data._id)
				user.save().then(() => {
					res.send(`Order created for user:${user.email} with orderId:${orderResponse.data._id}`)
				}).catch(e => {
					res.send("failed to add orderId in user's doc")
				})
			})	
		} else {
			res.send("Order not created..")
			span.finish();
		}
	} catch (error) {
		res.sendStatus(400).send("Error while creating the order")
		span.finish();
		
	}
})

// Delete user by userId
app.delete("/users/:uid", async (req, res) => {
	const parent = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);

	const span = tracer.startSpan('users.delete-user', { childOf: parent });
	User.findByIdAndDelete(req.params.uid).then(() => {
		res.send("User deleted with success...")
	}).catch( () => {
		res.sendStatus(404)
	})
	span.finish();
})


// Delete all the orders for an user
app.delete("/users/:uid/orders", async (req, res) => {
	const parent = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);

	const span = tracer.startSpan('users.delete-user-orders', { childOf: parent });
	axios.delete(`http://localhost:5151/orders?uid=${req.params.uid}`).then( delRes => {
		if(delRes.data.success) {
			res.send("Orders deleted..")
		} else {
			res.sendStatus(404).send(delRes.data)
		}
	}).catch( (err) => {
		res.sendStatus(404).send(err)
	})
	span.finish();
})

// APP listening on port 4040
app.listen(5050, () => {
	console.log("Up and running! -- This is our Users service")
})
