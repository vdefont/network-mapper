# network-mapper

Steps to set up the network mapper tool:
1. Set up a MySQL server
2. Install NodeJS, pull from github, and run


1. Set up a MySQL server

You must have the following tables:
- emaInfo
- routerProps
- instanceDate
- edge
- node

emaInfo:
| Field        | Type         | Null | Key | Default           | Extra                       |
+--------------+--------------+------+-----+-------------------+-----------------------------+
| emaNum       | int(11)      | NO   | PRI | NULL              |                             |
| ipAddr       | varchar(50)  | YES  |     | NULL              |                             |
| buildingName | varchar(255) | NO   |     | NULL              |                             |
| dateUpdated  | timestamp    | NO   |     | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |
| updateFreq   | int(11)      | NO   |     | 0                 |                             |

routerProps:
| Field       | Type         | Null | Key | Default           | Extra                       |
+-------------+--------------+------+-----+-------------------+-----------------------------+
| emaNum      | int(11)      | NO   | PRI | NULL              |                             |
| name        | varchar(255) | NO   |     | NULL              |                             |
| shortId     | varchar(255) | NO   | PRI | NULL              |                             |
| longId      | varchar(255) | NO   |     | NULL              |                             |
| type        | varchar(255) | NO   |     | NULL              |                             |
| isEndpoint  | int(11)      | NO   |     | NULL              |                             |
| resetNum    | int(11)      | YES  |     | NULL              |                             |
| dateUpdated | timestamp    | NO   |     | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |

instanceDate:
| Field       | Type      | Null | Key | Default           | Extra          |
+-------------+-----------+------+-----+-------------------+----------------+
| instanceNum | int(11)   | NO   | PRI | NULL              | auto_increment |
| date        | timestamp | NO   |     | CURRENT_TIMESTAMP |                |
| emaNum      | int(11)   | YES  |     | NULL              |                |

edge:
| Field       | Type         | Null | Key | Default | Extra |
+-------------+--------------+------+-----+---------+-------+
| instanceNum | int(11)      | NO   |     | NULL    |       |
| src         | varchar(255) | NO   |     | NULL    |       |
| dst         | varchar(255) | NO   |     | NULL    |       |
| lqi         | int(11)      | NO   |     | NULL    |       |
| rssi        | int(11)      | YES  |     | NULL    |       |

node:
| Field       | Type         | Null | Key | Default | Extra |
+-------------+--------------+------+-----+---------+-------+
| instanceNum | int(11)      | NO   |     | NULL    |       |
| label       | varchar(255) | NO   |     | NULL    |       |
| x           | int(11)      | NO   |     | NULL    |       |
| y           | int(11)      | NO   |     | NULL    |       |


2. Install NodeJS, pull from github, and run

You will need to install both Node and NPM.
I recommend using NVM (Node Version Manager) for this process.
I used these instructions:
https://nodesource.com/blog/installing-node-js-tutorial-using-nvm-on-mac-os-x-and-ubuntu/

Next, run "npm install" to install all necessary dependencies.

Finally, run "npm start" to start the web server.
