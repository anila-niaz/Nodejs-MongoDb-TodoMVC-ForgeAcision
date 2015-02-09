
/**
 * Module dependencies.
 */

var express = require('express')
    , routes = require('./routes')
    , user = require('./routes/user')
    , http = require('http')
    , path = require('path')
    , mongoose = require('mongoose')
    , io = require('socket.io')
    , mongoURI =  process.env.MONGOLAB_URI || 'mongodb://localhost/todos'
    , db = mongoose.connect(mongoURI)
    , Schema = mongoose.Schema
    , ObjectID = Schema.ObjectId
    , Todo = require('./models/todos.js').init(Schema, mongoose);

var app = express();

app.configure(function(){
    app.set('port', process.env.PORT || 8080);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
    app.use(express.errorHandler());
});

var server = http.createServer(app).listen(app.get('port'), function(){
    console.log("Express server listening on port " + app.get('port'));
});


var sio = io.listen(server);
//User online user count variable
var userCount = 0;
var users = [];

sio.sockets.on('connection', function (socket) {
    userCount++;

    var user = {
        id: userCount,
        socket: socket
    };

    users.push(user);

    socket.emit('count', { count: userCount });
    socket.broadcast.emit('count', { count: userCount });

    /*handles 'all' namespace
     function: list all todos
     response: all todos, json format
     */
    Todo.find({}, function(err, todos){
        socket.emit('all',todos);
    });

    /*handles 'add' namespace
     function: add a todo
     Response: Todo object
     */
    socket.on('add', function(data){
        var todo = new Todo({
            title: data.title,
            complete: false
        });

        todo.save(function(err){
            if(err) throw err;
            socket.emit('added', todo );
            socket.broadcast.emit('added', todo);
        });
    });
    /*Handles 'delete' namespace
     function: delete a todo
     response: the delete todo id, json object
     */
    socket.on('delete', function(data){
        Todo.findById(data.id, function(err, todo){
            todo.remove(function(err){
                if(err) throw err;
                socket.emit('deleted', data );
                socket.broadcast.emit('deleted', data);
            });
        });
    });

    /*Handles 'edit' namespace
     function: edit a todo
     response: edited todo, json object
     */
    socket.on('edit', function(data){
        Todo.findById(data.id, function(err, todo){
            todo.title = data.title;
            todo.save(function(err){
                if(err) throw err;
                socket.emit('edited', todo);
                socket.broadcast.emit('edited', todo);
            });
        });
    });

    /*Handles 'changestatus' namespace
     function: change the status of a todo
     response: the todo that was edited, json object
     */
    socket.on('changestatus', function(data){
        Todo.findById(data.id, function(err, todo){
            todo.complete = data.status == 'complete' ? true : false;
            todo.save(function(err){
                if(err) throw err;
                socket.emit('statuschanged', data );
                socket.broadcast.emit('statuschanged', data);
            });
        });
    });
    /*Handles 'allchangestatus' namespace
     function: change the status of all todos
     response: the status, json object
     */
    socket.on('allchangestatus', function(data){
        var master_status = data.status == 'complete' ? true : false;
        Todo.find({}, function(err, todos){
            for(var i = 0; i < todos.length; i++){
                todos[i].complete = master_status;
                todos[i].save(function(err){
                    if(err) throw err;
                    socket.emit('allstatuschanged', data);
                    socket.broadcast.emit('allstatuschanged', data);
                });
            }
        });
    });

    socket.on('newUser', function(data){
        var userName = data.name;
        var otherUsers = [];

        for(var i = 0; i < users.length; i++){
            if(users[i].socket == socket)
                users[i].name = userName;
        }

        console.log(users);

        emitUsersUpdate();
    });

//disconnect state
    socket.on('disconnect', function(){
        userCount--;

        for(var i = 0; i < users.length; i++){
            if(users[i].socket == socket)
                users.splice(i, 1);
        }

        emitUsersUpdate();

        socket.emit('count', { count: userCount });
        socket.broadcast.emit('count', { count: userCount });
    });

    function emitUsersUpdate(){
        for(var i = 0; i < users.length; i++){
            var otherUsers = users.filter(notCurrent)
                .map(toName);

            users[i].socket.emit('users', otherUsers);

            function notCurrent(user){
                return (users[i].socket != user.socket) && users[i].name;
            }

            function toName(user){
                return user.name
            }
        }
    }
});

//Our index page
app.get('/', routes.index);