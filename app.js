// Import modules
var http = require('http');
var fs = require('fs');
var ejs = require('ejs');
var express = require('express');
var bodyParser = require('body-parser');
var mysql = require('mysql');
var passwordHash = require('password-hash');
var session = require('express-session');
var helmet = require('helmet');

// SQL functions
var mySQLFunctions = require('./mySQLFunctions.js');

// API functions
var apiFunctions = require('./apiFunctions.js');

// SQL setup
var connection = mysql.createConnection({
  host     : "localhost",
  user     : "root",
  password : "ExplainMedianBrassUncleEnough",
  database : "embue"
});

// For testing
// var connection = mysql.createConnection({
//   host:"localhost",
//   user:"root",
//   password:"",
//   database:"embue"
// });

//////////////////////////////////////////////////////////////////////////////

// API setup
var apiLoadSQLSave = function(emaNum,callback){
  // Get EMA IP address
  mySQLFunctions.getEmaIpAddr(connection, emaNum, function(ipAddr){
    // Load data from API
    apiFunctions.load(emaNum,ipAddr,function(APIData){
      var nodeDict = APIData["nodeDict"];
      var edgeDict = APIData["edgeDict"];
      var propsDict = APIData["propsDict"];
      var endpointIdArr = APIData["endpointIdArr"];
      var emaNum = APIData["emaNum"];
      var buildingName = APIData["buildingName"];

      mySQLFunctions.save(connection,emaNum,nodeDict,edgeDict,propsDict,endpointIdArr,callback);
    });
  })
}



// Handle requests

var app = express();

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(bodyParser.urlencoded({extended:false}));
// Redirect http to https
// app.use(function(req, res, next) {
//   if(!req.secure) {
//     return res.redirect(['https://', req.get('Host'), req.url].join(''));
//   }
//   next();
// });
// Security
app.use(session({
  secret: 'F%$gK29@#gqqT4',
  name:"sessionId",
  cookie: {
    // TODO uncomment secure: true, // Only use HTTPS
    httpOnly: true,
    maxAge: 60 * 60 * 1000  // 1 hour
  }
}));
app.use(helmet());  // Security

// SQL load and res.render all data, optional callback for allData
var loadAndRender = function(res,page,callback){
  mySQLFunctions.load(connection,function(allData){
    res.render(page, {
        allData: JSON.stringify(allData)
    });
    if (typeof(callback)!="undefined") callback(allData);
  });
}

// mins must be > 0
var updateFreq = {};  // emaNum -> updateFreq
var minsLeft = {};  // emaNum -> minsLeft (until next update)
var periodicUpdate = function() {
  console.log("Periodic updateFreq: " + JSON.stringify(updateFreq));
  console.log("Periodic minsLeft: " + JSON.stringify(minsLeft));
  setTimeout(periodicUpdate,60*1000); // One minute timeout
  for (var emaNum in updateFreq) {
    if (minsLeft[emaNum] <= 0) {
      console.log("EMA_UPDATE" + emaNum);
      apiLoadSQLSave(emaNum,function(){
        console.log("EMA_UPDATE_SUCCESS: " + emaNum);
      });
      minsLeft[emaNum] = updateFreq[emaNum] - 1;
    }
    else minsLeft[emaNum] -= 1;
  }
}
periodicUpdate();

var resetEmaUpdateInfo = function(allData) {
  updateFreq = {};
  minsLeft = {};
  for (var emaNum in allData.emaInfo.updateFreq) {
    var curUpdateFreq = allData.emaInfo.updateFreq[emaNum];
    if (curUpdateFreq > 0) {
      updateFreq[emaNum] = curUpdateFreq;
      minsLeft[emaNum] = curUpdateFreq-1;
    }
  }
  console.log("New updateFreq: " + JSON.stringify(updateFreq));
  console.log("New minsLeft: " + JSON.stringify(minsLeft));
}



// Password verification

app.get('/', function(req, res) {
  // First time loading, set in motion periodic updates
  if (updateFreq == {}) loadAndRender(res,'index', resetEmaUpdateInfo);
  else loadAndRender(res,'index');
});

app.get('/admin',function(req,res){
  loadAndRender(res,'admin');
})

app.post('/addEma',function(req,res){
  var emaNum = req.body.emaNum;
  var ipAddr = req.body.ipAddr;
  var buildingName = req.body.buildingName;
  mySQLFunctions.addEma(connection,emaNum,ipAddr,buildingName,function(){
    loadAndRender(res,'admin');
  });
});

app.post('/freqUpdate', function(req, res) {
  var emaNum = req.body.emaNum;
  var freq = req.body.freq;
  console.log(`emaNum: ${emaNum}, freq: ${freq}`);
  mySQLFunctions.changeFreq(connection,emaNum,freq, function(){
    loadAndRender(res,'admin', resetEmaUpdateInfo);
  });
});

var awaitingSnapshotEmaNum = 0;
app.post('/takeSnapshot', function(req, res) {
  // Temporarily pause all other data gathering
  updateFreq = {};
  minsLeft = {};

  awaitingSnapshotEmaNum = req.body.emaNum;

  res.render('loading', {
      emaNum:awaitingSnapshotEmaNum,
      progressText:""
  });

  apiLoadSQLSave(awaitingSnapshotEmaNum,function(){
    awaitingSnapshotEmaNum = 0;
  });
});

// While the page is loading, it periodically sends a post request
app.post('/loading',function(req,res) {
  var progressText = apiFunctions.getProgressText();
  if (awaitingSnapshotEmaNum) {
    res.render('loading', {
        emaNum:awaitingSnapshotEmaNum,
        progressText:progressText
    });
  } else {
    loadAndRender(res,'index');
  }
});

// Start server

var port = process.env.PORT || 3000;

var server = app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});
////////////////////////////////////////////////////////////////////////
