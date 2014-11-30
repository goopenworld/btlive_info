var tr_host = '127.0.0.1';
var tr_port = 3000;
var max_peers_reply = 20;            // maximum number of peers in reply to subscribe message
var clear_inactive_peers_after = 20; // after this number of secords inactive peers will be removed from the swarm
var dgram = require('dgram');
var server = dgram.createSocket('udp4');
var _ = require('underscore');
var swarms_array = {};
function logtext (msg)
{
  var t = new Date();
  var space = '';
  for (var i = t.getMilliseconds().toString().length; i < 3; i++)
    space = space + '0';
  var txt = t.toLocaleTimeString() + '.' + space +  t.getMilliseconds() + ' ' + msg;
  console.log(txt);
}
function ip_port_to_hex (ip_port)
{
  var ip_port_array = ip_port.split(':');
  var ip = ip_port_array[0];
  var port = Number(ip_port_array[1]).toString(16);
  var ip_array = ip.split('.');
  ip_array.forEach(function(element, index, array){
    array[index] = Number(array[index]).toString(16);
    if (array[index].length == 1)
      array[index] = '0' + array[index];
  });
  var buf = new Buffer(6);
  buf.write(ip_array[0], 0, 1, 'hex');
  buf.write(ip_array[1], 1, 1, 'hex');
  buf.write(ip_array[2], 2, 1, 'hex');
  buf.write(ip_array[3], 3, 1, 'hex');
  buf.write(port, 4, 2, 'hex');
  return buf.toString('hex').toUpperCase();
}
server.on('listening', function(){
  var address = server.address();
  logtext('UDP tracker listening on ' + address.address + ":" + address.port);
});
server.on('message', function(message, remote){
  var peer = remote.address + ':' + remote.port;
  logtext('> RCVPKT(' + message.length + ') from ' + peer + ' | ' + message.toString('hex').toUpperCase());
  switch (message.toString('hex', 0, 1)) {
  case '00': // subscribe message
    var peer_swarm = message.toString('hex', 5).toUpperCase();
    if (!(peer_swarm in swarms_array))
    {
      logtext('  Creating new swarm ' + peer_swarm);
      swarms_array[peer_swarm] = {};
    }
    if (!(peer in swarms_array[peer_swarm]))
    {
      logtext('  Adding peer ' + peer + ' to swarm ' + peer_swarm);
      swarms_array[peer_swarm][peer] = new Date(); // storing time we saw the peer last
    }
    var snd_pkt_str = '03' + ip_port_to_hex(peer) + '000000000000000000' + '04';
    var swarm = _.keys(swarms_array[peer_swarm]);
    if (swarm.length > max_peers_reply) // if too many peers in the swarm, will pick them randomly
      swarm = _.shuffle(swarm);
    var i = 0;
    swarm.every(function(element, index, array){ // adding each peer of the swarm to reply packet
      if (element == peer)
        return true; // skipping self
      var t = new Date();
      if (t - swarms_array[peer_swarm][element] > clear_inactive_peers_after * 1000)
      { // if peer was inactive for too long
        delete swarms_array[peer_swarm][element]; // removing it from the swarm
        return true;
      }
      snd_pkt_str = snd_pkt_str + ip_port_to_hex(element);
      i++;
      if (i == max_peers_reply)
        return false; // stopping when maximum peers for reply packet reached
    });
    logtext('  Total ' + _.size(swarms_array[peer_swarm]) + ' peers in swarm ' + peer_swarm);
    var snd_pkt = new Buffer(snd_pkt_str, 'hex');
    logtext('< SNDPKT(' + snd_pkt.length + ') to ' + peer + ' | ' + snd_pkt_str);
    server.send(snd_pkt, 0, snd_pkt.length, remote.port, remote.address, function(err, bytes){
      if (err)
        throw err;
    });
    break;
  case '01': // unsubscribe message
    var peer_swarm = message.toString('hex', 6).toUpperCase();
    delete swarms_array[peer_swarm][peer]; // removing peer from the swarm
    logtext('  Total ' + _.size(swarms_array[peer_swarm]) + ' peers in swarm ' + peer_swarm);
    break;
  case '02': // heartbeat message
    var peer_swarm = message.toString('hex', 9).toUpperCase();
    swarms_array[peer_swarm][peer] = new Date(); // updating time we saw the peer last
    break;
  }    
});
server.bind(tr_port, tr_host);