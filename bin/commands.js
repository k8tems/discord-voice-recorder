const fs = require('fs');
const wavConverter = require('wav-converter');
const axios = require('axios');

const createNewChunk = (userName) => {
    const pathToFile = __dirname + `/../recordings/${Date.now()}__${userName}.pcm`;
    return fs.createWriteStream(pathToFile);
};

function pcmToWav(pcmData){
    return wavConverter.encodeWav(pcmData, {
        numChannels: 2,
        sampleRate: 48000,
        byteRate: 16
    })
}

exports.enter = function(msg, channelName) {
    channelName = channelName.toLowerCase();
    
    //filter out all channels that aren't voice or stage
    const voiceChannel = msg.guild.channels.cache
                            .filter(c => c.type === "voice" || c.type === "stage")
                            .find(channel => channel.name.toLowerCase() === channelName);
    
    //if there is no voice channel at all or the channel is not voice or stage
    if (!voiceChannel || (voiceChannel.type !== 'voice' && voiceChannel.type !== 'stage'))
        return msg.reply(`The channel #${channelName} doesn't exist or isn't a voice channel.`);
    
    console.log(`Sliding into ${voiceChannel.name} ...`);
    voiceChannel.join()
        .then(conn => {
            
            const dispatcher = conn.play(__dirname + '/../sounds/drop.mp3');
            dispatcher.on('finish', () => { console.log(`Joined ${voiceChannel.name}!\n\nREADY TO RECORD\n`); });
            
            const receiver = conn.receiver;
            conn.on('speaking', (user, speaking) => {
                if (speaking) {
                    const _buf = [];

                    console.log(`${user.username} started speaking`);
                    const audioStream = receiver.createStream(user, { mode: 'pcm' });
                    audioStream.on('data', (chunk) => _buf.push(chunk));
                    audioStream.on('end', () => { 
                        console.log(`${user.username} stopped speaking`);
                        const fname = __dirname + `/../recordings/${Date.now()}__${user.username}.wav`;
                        // `wav`変換は`Buffer`しか受け付けないので`Buffer.concat`で変換する必要がある
                        const wavData = pcmToWav(Buffer.concat(_buf));
                        fs.writeFile(fname, wavData, (err)=>{if(err)console.log(err)});
                        
                        console.log(`Transcribing ${fname}...`);

                        axios.post('http://127.0.0.1:8080/call', {'message': wavData.toString('base64')})
                        .then(response => {
                          console.log(`> ${response.data.message}`);
                        })
                        .catch(error => {
                          console.log(`error`);
                        });
                     });
                }
            });
        })
        .catch(err => { throw err; });
}

exports.exit = function (msg) {
    //check to see if the voice cache has any connections and if there is
    //no ongoing connection (there shouldn't be undef issues with this).
    if(msg.guild.voiceStates.cache.filter(a => a.connection !== null).size !== 1)
        return;
    
    //make sure it's .last() not .first().  some discord js magic going on rn
    const { channel: voiceChannel, connection: conn } = msg.guild.voiceStates.cache.last();
    const dispatcher = conn.play(__dirname + "/../sounds/badumtss.mp3", { volume: 0.45 });
    dispatcher.on("finish", () => {
        voiceChannel.leave();
        console.log(`\nSTOPPED RECORDING\n`);
    });
};