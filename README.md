# Migration tool
This tool is intended to simplify migration process from old NDG 5.04 server (JAVA + MySQL) to new MDG server (implemented on MEAN stack)

## Preparing for migration
Migration tool is implemented as web app. It is _NOT_ required to run it exactly on production server. As long as you have access both to old MySQL database and new MongoDB database - it is fine to run it, for example, on your development machine.
In fact, this is a suggested way to use this migration tool, which ensures your data is safe and consistent:

+ make backup of your MySQL database and deploy it to your local machine
+ setup node.js / mongoDB on your local machine
+ run migration tool on local machine
+ publish mongodb database to production server using ```mongodump```/```mongorestore```

# Installation

Installation is straightforward:
```
# git clone https://github.com/nokiadatagathering/ndg-migration
# cd ndg-migration
# npm install
```

Create in project root file config.js (you can use config.example.js as reference)
If you are going to send email to your users - edit ```templates/mail/password.jade``` to suit your needs.

# Migration

After that just run ```npm start``` and navigate to http://localhost:3000 - you are ready to start migration

Migration of entire nokiadatagathering.net database took approx. 5-7 minutes on Core i7 machine, so be prepared - that may take a while. 

_ATTENTION_ Never migrate data to existing database. Migrator drops all collections on MongoDB database, so alway have backups before running migration
