/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * 'License'); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
var app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
    },
    // deviceready Event Handler
    //
    // The scope of 'this' is the event. In order to call the 'receivedEvent'
    // function, we must explicitly call 'app.receivedEvent(...);'
    onDeviceReady: function() {
        // Connect to bus
        console.log('Connecting to bus');
        app.displayStatus('Connecting to bus...');
        if (AllJoyn) {
            AllJoyn.connect(app.onBusConnected, app.getFailureFor('AllJoyn.connect'));
        } else {
            console.log('Error: AllJoyn not found. (Is the plugin installed?)');
        }
    },
    onBusConnected: function(bus) {
        app.bus = bus;

        var proxyObjects = [{
                path: '/',
                interfaces: [
                    [
                        '#org.freedesktop.DBus.Introspectable',
                        '?Introspect >s',
                        ''
                    ],
                    [
                        'org.freedesktop.DBus.Properties',
                        '?Get <s <s >v',
                        '?Set <s <s <v',
                        '?GetAll <s >a{sv}',
                        ''
                    ],
                    [
                        '#org.allseen.Introspectable',
                        '?GetDescriptionLanguages >as',
                        '?IntrospectWithDescription <s >s',
                    ],
                    null
                ]
            },
            null
        ];
        AllJoyn.registerObjects(app.onRegisteredObjects, app.getFailureFor('AllJoyn.RegisterObject'), null, proxyObjects);
    },
    onRegisteredObjects: function() {
        app.displayStatus('Looking for devices...');
        app.bus.addInterfacesListener([], app.onFoundDevice);
    },
    onFoundDevice: function(deviceInfo) {
        app.displayStatus('Found Device: ' + deviceInfo.message.sender + ' @ ' + deviceInfo.port);
        var service = {
            name: deviceInfo.message.sender,
            port: deviceInfo.port
        };
        console.log(JSON.stringify(arguments));

        if (!app.devices) {
            app.devices = [];
            app.devicesToJoin = [];
        }

        var deviceIndex = app.devices.push(deviceInfo) - 1;
        app.devicesToJoin.push(deviceIndex);
        if (app.devicesToJoin.length === 1) {
            app.bus.joinSession(app.onJoinedSession, app.getFailureFor('bus.joinSession'), service);
        }
    },
    onJoinedSession: function(session) {
        console.log(JSON.stringify(session));
        var deviceJoinedIndex = app.devicesToJoin[0];
        var device = app.devices[deviceJoinedIndex];
        if (device.message.sender === session.sessionHost) {
            device.session = session;
            device.objectsToQuery = ['/'];
            device.session.introspect = function(onIntrospectionSuccess, objectPath) {
                var introspectIndexList = [2, 0, 0, 0];
                device.session.callMethod(onIntrospectionSuccess, app.getFailureFor('introspect'), device.session.sessionHost, objectPath, introspectIndexList, "", [], 's');
            };
            device.session.introspectWithDescription = function(onIntrospectionSuccess, objectPath, language) {
                var introspectIndexList = [2, 0, 2, 1];
                device.session.callMethod(onIntrospectionSuccess, app.getFailureFor('IntrospectWithDescription'), device.session.sessionHost, objectPath, introspectIndexList, 's', [language], 's');
            };
            app.addDeviceButton(deviceJoinedIndex, device);
        }

        app.displayStatus('Joined Session: ' + session.sessionId);
        app.devicesToJoin.shift();
        if (app.devicesToJoin.length > 0) {
            var nextDeviceToJoin = app.devicesToJoin[0];
            var service = {
                name: app.devices[nextDeviceToJoin].message.sender,
                port: app.devices[nextDeviceToJoin].port
            };
            app.bus.joinSession(app.onJoinedSession, app.getFailureFor('bus.joinSession'), service);
        }
    },
    resetInputControls: function() {
        var inputControls = document.getElementById('devices');
        inputControls.innerHTML = '';
        var inputHeader = document.createElement('h2');
        inputHeader.textContent = "device";
        inputControls.appendChild(inputHeader);
    },
    parseIntrospectionXml: function(xml, objectPath) {
        var pathSeparator = '/';
        if (objectPath === '/') {
            pathSeparator = '';
        }
        console.log("Xml: " + xml);
        console.log("ObjectPath: " + objectPath);
        var introspectionResult = {};
        introspectionResult.childObjects = [];
        introspectionResult.interfaces = [];
        var domParser = new DOMParser();
        var domFromXml = domParser.parseFromString(xml, "text/xml");
        var futureNodes = domFromXml.getElementsByTagName('node');
        for (var k = 0; k < futureNodes.length; k++) {
            if (futureNodes.item(k).getAttribute('name')) {
                var fn = objectPath + pathSeparator + futureNodes.item(k).getAttribute('name');
                if (k !== 0) {
                    introspectionResult.childObjects.push(fn);
                }
            }
        }

        var getParamStringForMethod = function(node) {
            var paramString = "";
            var nodeChildren = node.childNodes;
            for (var j = 0; j < nodeChildren.length; j++) {
                var child = nodeChildren.item(j);
                if (child.nodeName === "arg") {
                    paramString += " ";
                    if (child.getAttribute('name')) {
                        paramString += child.getAttribute('name');
                    }

                    if (child.getAttribute('direction') === 'in') {
                        paramString += '<';
                    } else {
                        paramString += '>';
                    }
                    paramString += child.getAttribute('type');
                }
            }
            return paramString;
        };

        var getParamStringForProperty = function(node) {
            var paramString = " ";
            switch (node.getAttribute('access')) {
                case 'read':
                    paramString += '>';
                    break;
                case 'write':
                    paramString += '<';
                    break;
                case 'readwrite':
                    paramString += '=';
                    break;
            }
            paramString += node.getAttribute('type');
            return paramString;
        };

        var elements = domFromXml.getElementsByTagName('interface');
        for (var i = 0; i < elements.length; i++) {
            var ifaceName = elements.item(i).getAttribute('name');
            var newInterface = [ifaceName];
            console.log('  ' + ifaceName);
            if (ifaceName === 'org.allseen.Introspectable') {
                introspectionResult.hasAllSeenIntrospection = true;
                console.log("FOUND ALLSEEN INTRO");
            }
            introspectionResult.interfaces.push(newInterface);

            var iface = elements.item(i);
            var ifaceChildren = iface.childNodes;
            for (var j = 0; j < ifaceChildren.length; j++) {
                var child = ifaceChildren.item(j);
                var ifaceLine = null;
                switch (child.nodeName) {
                    case 'method':
                        ifaceLine = '?' + child.getAttribute('name') + getParamStringForMethod(child);
                        console.log('    ' + ifaceLine);
                        break;
                    case 'signal':
                        ifaceLine = '!' + child.getAttribute('name') + getParamStringForMethod(child);
                        console.log('    ' + ifaceLine);
                        break;
                    case 'property':
                        ifaceLine = '@' + child.getAttribute('name') + getParamStringForProperty(child);
                        console.log('    ' + ifaceLine);
                        break;
                    default:
                        break;
                }
                if (ifaceLine) {
                    newInterface.push(ifaceLine);
                }
            }
        }

        return introspectionResult;
    },
    addDeviceButton: function(deviceIndex, device) {
        var inputControls = document.getElementById('devices');

        var inputControl = document.createElement('div');
        inputControl.className = 'control';
        inputControl.id = 'device' + deviceIndex;
        var inputControlContent = document.createTextNode(device.session.sessionHost);
        inputControl.appendChild(inputControlContent);

        inputControl.addEventListener('click', function introspect() {
            var objectPath = device.objectsToQuery.pop();
            if (objectPath) {
                device.session.introspect(function(xml) {
                    var parsedXml = app.parseIntrospectionXml(xml.arguments[0], objectPath);
                    device.objectsToQuery = device.objectsToQuery.concat(parsedXml.childObjects);
                    var continueWithIntrospection = function() {
                        if (device.objectsToQuery.length > 0) {
                            introspect();
                        }
                    };
                    if (parsedXml.hasAllSeenIntrospection) {
                        device.session.introspectWithDescription(function(result) {
                            console.log("ALLSEEN INTROSPECTION: " + JSON.stringify(result));
                            continueWithIntrospection();
                        }, objectPath, 'en');
                    } else {
                        continueWithIntrospection();
                    }
                }, objectPath);
            }
        }, false);

        inputControls.appendChild(inputControl);
    },
    getSuccessFor: function(successType) {
        var successMsg = 'Success';
        if (successType) {
            successMsg = 'Success: ' + successType;
        }
        return function() {
            console.log(JSON.stringify(arguments));
            app.displayStatus(successMsg);
        };
    },
    getFailureFor: function(failureType) {
        var failureMsg = 'Failure';
        if (failureType) {
            failureMsg = 'Failure during: ' + failureType;
        }
        return function(error) {
            console.log(failureMsg);
            if (error) {
                console.log('Error: ' + error);
            }
        };
    },
    displayStatus: function(status) {
        console.log(status);
        var statusElement = document.getElementById('status');
        statusElement.textContent = status;
    },
};

app.initialize();
