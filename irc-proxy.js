var irc = require('irc');
var amqp = require('amqplib/callback_api');


var proxies = {}; // mapa de proxys
var amqp_conn;
var amqp_ch;
var irc_client;

// Conexão com o servidor AMQP
amqp.connect('amqp://localhost', function (err, conn) {
	conn.createChannel(function (err, ch) {
		console.log("conn2 " + conn);

		amqp_conn = conn;
		amqp_ch = ch;

		inicializar();
	});
});

function inicializar() {

	receberDoCliente("registro_conexao", function (msg) {

		var id = msg.id;
		var servidor = msg.servidor;
		var nick = msg.nick;
		var canal = msg.canal;

		irc_client = new irc.Client(
			servidor,
			nick,
			{ channels: [canal] }
		);

		irc_client.addListener('message' + canal, function (from, message) {

			console.log(from + ' => ' + canal + ': ' + message);

			enviarParaCliente(id, {
				"timestamp": Date.now(),
				"nick": from,
				"msg": message
			});
		});


		irc_client.addListener('error', function (message) {
			console.log('error: ', message);
		});

		irc_client.addListener('motd', function (message) {
			console.log("addListener motd " + message);
			enviarParaCliente(id, {
				"timestamp": Date.now(),
				"nick": nick,
				"msg": message
			});
		});

		irc_client.addListener('registered', function (message) {
			enviarParaCliente(id, {
				"timestamp": Date.now(),
				"nick": nick,
				"msg": message
			});
		});

		irc_client.addListener('names', function (message) {
			enviarParaCliente(id, {
				"timestamp": Date.now(),
				"msg": JSON.stringify(message)
			});
		});

		irc_client.addListener('join', function (channel, nick, message) {
			console.log("addListener join :");
			enviarParaCliente(id, {
				"timestamp": Date.now(),
				"nick": nick + " se juntou ao Canal " + channel
			});
		});

		irc_client.addListener('nick', function (oldnick, newnick, channels, message) {
			//console.log("nick message= "+message +"text="+text);
			enviarParaCliente(id, {
				"timestamp": Date.now(),
				"msg": "  "+oldnick+" agora é conhecido como "+newnick
			});
		});

		proxies[id] = irc_client;
	});

	receberDoCliente("gravar_mensagem", function (msg) {

		if (msg.msg.charAt(0) == '/') {
			if (msg.msg == "/motd") {
				console.log("teste motd");
				irc_client.send("motd");
			}
			if (msg.msg == "/quit") {
				irc_client.send("quit");
				irc_client.disconnect();
				enviarParaCliente(irc_client.id, '/quitOk');
				delete proxies[irc_client.id];
				delete irc_client;
			}
			if (msg.msg == "/names") {
				irc_client.send("names");
				irc_client.disconnect();
			}
			if (msg.msg == "/join") {
				irc_client.send("join");
				irc_client.disconnect();
			}
		} else {
			irc_client.say(msg.canal, msg.msg);
		}

	});
}

function receberDoCliente(canal, callback) {

	amqp_ch.assertQueue(canal, { durable: false });

	console.log(" [irc] Waiting for messages in ", canal);

	amqp_ch.consume(canal, function (msg) {

		console.log(" [irc] Received %s", msg.content.toString());
		callback(JSON.parse(msg.content.toString()));

	}, { noAck: true });
}

function enviarParaCliente(id, msg) {

	msg = new Buffer(JSON.stringify(msg));

	amqp_ch.assertQueue("user_" + id, { durable: false });
	amqp_ch.sendToQueue("user_" + id, msg);
	console.log(" [irc] Sent %s", msg);
}




