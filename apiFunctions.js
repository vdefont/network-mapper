// Import modules
var request = require("request")
var http = require('http');

// Static variables
var EMA_NUM = 1063;
var IP_ADDR = '10.100.0.1063';
var BUILDING_NAME = "ABBOTT MILL PHASE 3";
var ROUTER_TYPES = ["Thermostat","Generic Device","LoadController"];
var ENDPOINT_TYPES = ["IndoorSensor"];
var URL_ATTEMPTS_BEFORE_FAILURE = 2;  // Number of times to retry a URL (3 is good)

// Global variables
var shortIdArr;  // All devices
var routerIdArr; // Routers only
var offlineRouterIdArr;  // Routers that are offline
var endpointIdArr; // Enpoints only
var propsDict;
var routesDict;  // [src,dst] -> lqi
var lqiDict;
var positions; // node label -> [x,y]

// Information about router and LQI tables currently loaded
var progressText;

// UTILTY FUNCTIONS

function reset(){
  // Global variables
  shortIdArr = [];  // All devices
  routerIdArr = []; // Routers only
  offlineRouterIdArr = [];  // Routers that are offline
  endpointIdArr = []; // Enpoints only
  propsDict = {longId:{},shortId:{},type:{},name:{},children:{},parent:{},rssi:{},resetNum:{}};
  routesDict = {};  // [src,dst] -> lqi
  lqiDict = {};
  positions = {}; // node label -> [x,y]
  progressText="";
}

function convertEndian(wrongEndian) {
  // Add leading zeroes
  while (wrongEndian.length < 4) {
    wrongEndian = "0" + wrongEndian;
  }

  // Switch bytes
  var rightEndian = wrongEndian.slice(2,4) + wrongEndian.slice(0,2);

  // Remove leading zeroes
  while (rightEndian.length > 1 && rightEndian[0] == 0) {
      rightEndian = rightEndian.slice(1);
  }

  return(rightEndian);
}

function intToHex(currInt){
  return currInt.toString(16);
}


// FUNCTIONS TO READ FROM API

function getJson(urlAddition,callback,extraData,triesLeft) {
  if (typeof(extraData)=="undefined") extraData = "";
  if (typeof(triesLeft)=="undefined") triesLeft = URL_ATTEMPTS_BEFORE_FAILURE;

  var url = "http://" + IP_ADDR + ":8080/com.coincident.ema.web/api/v2/devices" + urlAddition;
  var responseHandled = 0;
  request({
      url: url,
      json: true
  }, function (error, response, body) {
      if (!responseHandled) {
        responseHandled = 1;

        // If there is a valid response, return it
        if (!error && response.statusCode === 200 && body) {
          callback(body,extraData)
        }

        // If response invalid, try again
        else if (triesLeft == 1) {
          var text = "Reached " + URL_ATTEMPTS_BEFORE_FAILURE + " failures, given up for url: " + url;
          progressText += text + "\n";
          console.log(text);
          callback(0,extraData)
        } else {
          var text = "Failed, retrying url: " + url;
          progressText += text + "\n";
          console.log(text);
          getJson(urlAddition,callback,extraData,triesLeft-1);
        }
      }
  })
}

// Get deviceData
function loadDeviceData(onFinish) {
  getJson("?meta=true", function(devices){
    var top = devices.length;
    for (var i = 0; i < top; i ++) {
      // Get device info
      var device = devices[i];
      shortId = device.meta.transientAddress;
      longId = device.id;
      type = device.meta.type;
      name = device.meta.name;
      if (name==null && device.meta.logicalNetwork) {
        name = device.meta.logicalNetwork.name;
      }

      // Save device info
      shortIdArr.push(shortId);
      propsDict.longId[shortId] = longId;
      propsDict.type[shortId] = type;
      propsDict.name[shortId] = name;
      propsDict.children[shortId] = [];

      // Count routers and endpoints
      if (ROUTER_TYPES.indexOf(type) != -1) routerIdArr.push(shortId);
      else if (ENDPOINT_TYPES.indexOf(type) != -1) endpointIdArr.push(shortId);
    }

    onFinish();
  });
}

// Next: get route table data
function loadRouteData(onFinish){
  var numRouteTablesLoaded = 0;
  var numRouters = routerIdArr.length;
  propsDict.children["0"] = []; // Set up children of core

  var routeLoaded = function(routes, shortId){
    // If nothing was loaded, remove route from array
    if (!routes) {
      shortIdArr.splice(shortIdArr.indexOf(shortId),1);
      routerIdArr.splice(routerIdArr.indexOf(shortId),1);
      offlineRouterIdArr.push(shortId);
    }

    else {
      // Save each route
      var top = routes.length;
      for (var i = 0; i < top; i++) {
        var route = routes[i];
        var next = convertEndian(route.nextHopAddress);
        var dest = convertEndian(route.destAddress);

        // Save route if leading to core
        if (dest == "0") {
          routesDict[[shortId,next]] = "";
          propsDict.parent[shortId] = next; // Add parent
          if (!(next in propsDict.children)) propsDict.children[next] = [];
          propsDict.children[next].push(shortId); // Add child
        }
      }
    }

    // Check if all routes have been loaded
    numRouteTablesLoaded ++;
    text = numRouteTablesLoaded + " of " + numRouters + " route tables loaded.";
    progressText += text + "\n";
    console.log(text);
    if (numRouteTablesLoaded == numRouters) onFinish();
  }

  // Load routes
  for (var i = 0; i < numRouters; i++) {
    var currShortId = routerIdArr[i];
    var currLongId = propsDict.longId[currShortId];
    getJson("/routetable/" + currLongId,routeLoaded,currShortId);
  }
}

// Populates "lqiDict" global variable
function loadLqiData(onFinish) {
  var numLqiLoaded = 0;
  var numRouters = routerIdArr.length;

  var lqiLoaded = function(lqiRows,shortId){
    if(lqiRows) {
      var lqiRowsLen = lqiRows.length;

      // Add all rows to dict
      for (var i = 0; i < lqiRowsLen; i++) {
        var currRow = lqiRows[i];
        var destId = intToHex(currRow.nodeAddr);

        // Add to lqi dict
        var lqi = currRow.lqi;
        lqiDict[[shortId,destId]] = lqi;

        // If endpoint, add as child
        if (endpointIdArr.indexOf(destId) > -1) {
          propsDict.children[shortId].push(destId); // Add as child
          routesDict[[destId,shortId]] = "";  // Add route
        }
      }
    }

    // If loaded all LQI data, proceed
    numLqiLoaded++;
    text = "Loaded " + shortId + ", " + numLqiLoaded + " of " + numRouters + " lqi tables loaded.";
    progressText += text + "\n";
    console.log(text);
    if (numLqiLoaded == numRouters) onFinish();
  };

  // Get the LQI data for each route
  for (var i = 0; i < numRouters; i++) {
    var currShortId = routerIdArr[i];
    var currLongId = propsDict.longId[currShortId];
    getJson("/lqitable/" + currLongId,lqiLoaded,currShortId);
  }
}

// Populates "rssi" and "resetNum" variables
function loadRssiData(onFinish) {
  var numRssiLoaded = 0;
  var numRouters = routerIdArr.length;

  var rssiLoaded = function(rssiDict,shortId){
    if(rssiDict) {
      // Get data
      var curResetNum = rssiDict.resetNum;
      var curRssi = rssiDict.lastMsgRssi;

      // Save data
      if (curRssi==null) curRssi="null";
      if (curResetNum==null) curResetNum="null";
      propsDict.resetNum[shortId] = curResetNum;
      propsDict.rssi[shortId] = curRssi;

    }

    // If loaded all LQI data, proceed
    numRssiLoaded++;
    text = "Loaded " + shortId + ", " + numRssiLoaded + " of " + numRouters + " rssi values loaded.";
    progressText += text + "\n";
    if (numRssiLoaded == numRouters) onFinish();
  };

  // Get the LQI data for each route
  for (var i = 0; i < numRouters; i++) {
    var curShortId = routerIdArr[i];
    var curLongId = propsDict.longId[curShortId];
    getJson("/networkstats/" + curLongId,rssiLoaded,curShortId);
  }
}

// FUNCTIONS TO CLEAN DATA AND MAKE GRAPH

// Get positions for nodes
function getPositions(childrenDict) {
  var positions = {}; // Dict: shortId -> [x,y]

  var currLayer = ["0"].concat(offlineRouterIdArr);
  var nextLayer = [];
  var currX = 0;
  while (currLayer.length > 0) {
    var currY = 0;
    for (var i = 0; i < currLayer.length; i++) {
      var currId = currLayer[i];

      // Add position
      positions[currId] = [currX,currY];
      currY += 1;

      // Add children to next layer
      nextLayer = nextLayer.concat(childrenDict[currId]);
    }

    // Move on to next layer
    currX += 1;
    currLayer = nextLayer;
    nextLayer = [];
  }

  return positions;
}

// Adds LQI data to routesDict
function addLqiData(){
  for (route in routesDict) {
    var lqi = lqiDict[route];

    // If not in LQI table, see if reverse route is in table
    if(!lqi) {
      var reversedRoute = route.split(",").reverse();
      lqi = lqiDict[reversedRoute];

      // If also not in LQI table, set to -1
      if(!lqi) lqi = "-1";
    }

    routesDict[route] = lqi;
  }
}

function load(emaNum,ipAddr,callback) {
  EMA_NUM = emaNum;
  IP_ADDR = ipAddr;
  reset();
  loadDeviceData(function(){
    loadRouteData(function(){
      loadLqiData(function(){
        loadRssiData(function(){
          addLqiData();
          positions = getPositions(propsDict.children);
          var ret = {};
          ret["nodeDict"] = positions;
          ret["edgeDict"] = routesDict;
          ret["propsDict"] = propsDict;
          ret["endpointIdArr"] = endpointIdArr;
          ret["buildingName"] = BUILDING_NAME;
          ret["emaNum"] = EMA_NUM;
          reset();
          callback(ret);
        });
      });
    });
  });
}

function getProgressText(){
  return(progressText);
}

module.exports = {
  load:load,
  getProgressText:getProgressText
}
