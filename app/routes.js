var Case = require('./models/case');
var Store = require('./models/store');
var ObjectId = require('mongoose').Types.ObjectId;
var bodyParser = require('body-parser')
const connectEnsureLogin = require('connect-ensure-login');
var jsonParser = bodyParser.json({
  limit: '50mb'
})



module.exports = function(app, passport) {
  app.get("/api/v1/test", function(req, res) {
    console.log("[Router] Test Endpoint")
    var search = {};
    if (req.query.id) search["_id"] = req.query.id;
    Store.aggregate(
      [
        { $lookup: {
          from: "cases",
          localField: "caseId",
          foreignField: "_id",
          as: "caseId"
        }},
        { $unwind: "$caseId" },
        { $match: { "caseId.status": 1 } },
        { $project : {
          _id : 0 ,
          lat : 1 ,
          lng : 1 ,
          time : 1,
          speed: 1
      }}
      ],
      function(err, result) {
        res.send({ success: true, _error: null, data: result});
      }
    )
  });

  app.post('/api/v1/upload', jsonParser, function(req, res){
    var d = new Date();
    console.log("[Router] Case Upload - Points: " + req.body.data.length);
    if (req.query.username) var username = req.query.username; else return res.send({ success: false, _error: "No Username set"});
    if (req.query.password) var password = req.query.password; else return res.send({ success: false, _error: "No Password set"}); 
    let btId = ((req.query.btId) ? req.query.btId : undefined);
    var newCase = new Case({
      status: 0,
      btId: btId,
      serverTime: new Date(),
      username: username
    });
    newCase.setPassword(password, function () {
      newCase.save(function (err) {
        if (err) {
          console.log("[Router] Save Case Error: " + err);
          return res.status(403).send({ success: false, _error: err });
        } else {
          const stores_array = [];
          for(var k in req.body.data) {
            let speed = ((req.body.data[k].speed) ? req.body.data[k].speed : undefined);
            let geocode = ((req.body.data[k].geocode) ? req.body.data[k].geocode[0] : undefined);
            console.log(geocode);
            var newstore = new Store({
              caseId: ObjectId(newCase._id),
              lat: req.body.data[k].lat,
              lng: req.body.data[k].lng,
              time:  new Date(req.body.data[k].time),
              speed: speed,
              geocode: geocode
            });
            stores_array.push(newstore);      
          }
          Store.insertMany(stores_array);
          var f = new Date();
          var diff = Math.abs(d - f);
          res.send({ success: true, _error: null, count: req.body.data.length, timeMS: diff, caseId:newCase._id, btId:newCase.btId});
        }
      });
    });
  });
  //ToDo: Select Cache if build
  //ToDo: GZIP Option for Download
  app.get('/api/v1/download', function(req, res){
    if (req.query.startId && ObjectId.isValid(req.query.startId) != true) {
      return res.status(403).send({
        success: false,
        _error: "Error: ObjectID emty format. Argument passed in must be a single String of 12 bytes or a string of 24 hex characters."
      });
    }
    var limit = 5000;
    var d = new Date();
    var search = {"caseId.status": 1}
    if (req.query.startId) search["_id"] = {$gte: ObjectId(req.query.startId)};
    Store.aggregate(
      [
        { $lookup: {
          from: "cases",
          localField: "caseId",
          foreignField: "_id",
          as: "caseId"
        }},
        { $unwind: "$caseId" },
        { $sort: { _id: 1 } },
        { $match: search},
        { $limit : limit },
        { $project : {
          _id : 1 ,
          lat : 1 ,
          lng : 1 ,
          speed : 1 ,
          time : 1
      }}
      ],function(err, result) {
        if (result.length <= 0) return res.send({ success: false, _error: "No Stores found"});
        var latest = result.slice(-1).pop()._id;
        var is_update = (result.length < limit)
        var f = new Date();
        var diff = Math.abs(d - f);
        console.log("[Router] Case Download ID: " + req.query.startId + " Points: " + result.length);
        res.send({ success: true, _error: null, count: result.length, timeMS: diff, latestId:latest, isNewest:is_update, data: result});
      }
    );
  });
  //ToDo: Change from Filter to Passwort auth
  app.get('/api/v1/case', function(req, res){
    var d = new Date();
    var n = d.toLocaleTimeString();
    var search = {};
    if (req.query.lat) search["lat"] = req.query.lat;
    if (req.query.lng) search["lng"] = req.query.lng;
    if (req.query.time) search["time"] = new Date(req.query.time);
    console.log("[Router] Case Request - Lat:" + search.lat + " Lng:" + search.lng + " Time:" + search.time);
    Store.find( search , {},function(err, result) {
        if (err) throw err;
        var caseIds = []
        for(var k in result) {
          caseIds.push(result[k].caseId);
        }
        Case.find({_id : { $in : caseIds } }, {},function(err, result) {
          var f = new Date();
          var diff = Math.abs(d - f);
          res.send({ success: true, _error: null, timeMS: diff, data: result});
        });
    });
  });
  app.get('/api/v1/case/del', connectEnsureLogin.ensureLoggedIn("/api/v1/login"), function(req, res){
    if (ObjectId.isValid(req.user._id) != true) {
      return res.status(403).send({
        success: false,
        _error: "Error: ObjectID emty format. Argument passed in must be a single String of 12 bytes or a string of 24 hex characters."
      });
    }
    var d = new Date();
    var search_cases = {};
    var search_stores = {};
    if (req.user._id) search_cases["_id"] = ObjectId(req.user._id);
    if (req.user._id) search_stores["caseId"] = ObjectId(req.user._id);
    console.log("[Router] Del Case - ID:" + search_cases._id);
    Case.findOne( search_cases , {},function(err, result) {
        if (err) throw err;
        if(result) {
          Case.deleteOne(search_cases,function(err, result) {
            if (err) throw err;
            Store.deleteMany( search_stores, {},function(err, result) {
              if (err) throw err;
              var f = new Date();
              var diff = Math.abs(d - f);
              res.send({ success: true, _error: null, timeMS: diff, data: result});
            });
          })
        } else {
          return res.status(403).send({ success: false, _error: "No Case found to Delete" });
        }
    });
  });
  app.get('/api/v1/case/edit', connectEnsureLogin.ensureLoggedIn("/api/v1/login"), function(req, res){
    if (ObjectId.isValid(req.user._id) != true) {
      return res.status(403).send({
        success: false,
        _error: "Error: ObjectID emty format. Argument passed in must be a single String of 12 bytes or a string of 24 hex characters."
      });
    }
    var d = new Date();
    var search_cases = {};
    var search_stores = {};
    var set_status;
    var bt_id;
    var contactInfo = [];
    if (req.user._id) search_cases["_id"] = ObjectId(req.user._id);
    if (req.user._id) search_stores["caseId"] = ObjectId(req.user._id);
    if (req.query.status) set_status = req.query.status;
    if (req.query.btId) bt_id = req.query.btId;
    if (req.query.phone) contactInfo.phone = req.query.phone;
    if (req.query.info) contactInfo.info = req.query.info;
    if (req.query.text) contactInfo.text = req.query.text;
    console.log("[Router] Edit Case - ID:" + search_cases._id);
    Case.findOne( search_cases , {},function(err, result) {
      if (err) throw err;
      if(result) {
        if (set_status) result.status = set_status;
        if (bt_id) result.btId = bt_id;
        if (contactInfo.phone) result.contactInfo.phone = contactInfo.phone;
        if (contactInfo.info) result.contactInfo.info = contactInfo.info;
        if (contactInfo.text) result.contactInfo.text = contactInfo.text;
        result.save(search_cases,function(err, result) {
          if (err) throw err;
          var f = new Date();
          var diff = Math.abs(d - f);
          res.send({ success: true, _error: null, timeMS: diff, data: result});
        })
      } else {
        return res.status(403).send({ success: false, _error: "No Case found to Delete" });
      }
    });
  });

  app.get('/api/v1/case/updatecache', function(req, res){
    console.log("[Router] Update Cache DB");
    var d = new Date();
    Store.aggregate( [
        { $lookup: {
          from: "cases",
          localField: "caseId",
          foreignField: "_id",
          as: "caseId"
        }},
        { $unwind: "$caseId" },
        { $match: {"caseId.status": {$gte: 1}}},
        { $project : {
          _id : 1 ,
          caseId: 1,
          lat : 1 ,
          lng : 1 ,
          speed : 1 ,
          time : 1
        }},
        { $merge: { into: "c", on: "_id", whenMatched: "replace", whenNotMatched: "insert" } }
      ],function(err, result){
        var f = new Date();
        var diff = Math.abs(d - f);
        res.send({ success: true, _error: null, timeMS: diff, data: result});
      }
    );
  });

  app.post('/api/v1/login', (req, res, next) => {
    passport.authenticate('local',
      (err, user, info) => {
        if (err) return next(err)
        if (!user) return res.send({ success: false, _error: "User does not exist or Passwort false"});

        req.logIn(user, function(err) {
          if (err) return next(err);
          return res.send({ success: true, _error: "Login Success"});
        });
      }
    )(req, res, next);
  });

  app.get('/api/v1/login', (req, res, next) => {
    if (!req.user) {
      return res.send({ success: false, _error: "You are not logged in. Please try again!"});
    } else {
      return res.send({ success: true, _error: "You are logged in"});
    }
  });

  app.get('/api/v1/logout', function(req, res) {
		req.logout();
		return res.send({ success: true, _error: "Logout Success"});
  });
  
};