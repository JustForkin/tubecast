'use strict';

exports = module.exports = function(config, storage, log) {

    const Promise = require('bluebird');
    const path = require('path');
    const os = require('os');
    const spawn = require('../../lib/spawn');
    const s = require('underscore.string');
    const _ = require('lodash');
    const fs = require('../../lib/fs');
    const ytdl = require('youtube-dl');
    const download = require('download');
    const { async, await } = require('asyncawait');

    return new class {

        update() {
            return this.fetchVideos()
                .map((video) => {
                    video.url = `https://www.youtube.com/watch?v=${video.id}`;
                    return video;
                })
                .filter((video) => {
                    return storage.has(video.id)
                        .then((has) => {
                            return !has;
                        });
                })
                .each((video) => {
                    return this.dl(video);
                });
        }

        dl(video) {
            log.info(`Fetching video: ${video.url}`);
            return this.dlVideo(video)
                .then(() => {
                    return this.dlMeta(video);
                })
                .then((meta) => {
                    log.info(`Fetched video: ${video.url} / ${meta.description}`);
                    return this.dlThumbnail(video, _.get(meta, 'thumbnails.0.url'));
                });
        }

        dlVideo(video) {
            return new Promise((resolve, reject) => {
                const args = ['-x', '--audio-format', 'mp3', '--embed-thumbnail', '--output', '%(id)s.%(ext)s'];
                return ytdl.exec(video.url, args, {
                    'cwd': config.get('storage:path')
                }, (err, output) => {
                    if (err) {
                        return reject(err);
                    } else {
                        return resolve();
                    }
                });
            });
        }

        dlThumbnail(video, url) {
            url = url || `http://img.youtube.com/vi/${video.id}/1.jpg`;
            const dest = path.resolve(config.get('storage:path'), `${video.id}.jpg`);
            log.debug(`Fetching video thumbnail`, {
                'url': url,
                'dest': dest,
                'video': video
            });
            return Promise.resolve(download(url))
                .then((data) => {
                    return fs.writeFileAsync(dest, data);
                });
        }

        dlMeta(video) {
            const destFile = path.resolve(config.get('storage:path'), `${video.id}.json`);
            return new Promise((resolve, reject) => {
                ytdl.getInfo(video.url, [], function(err, info) {
                    if (err) {
                        return reject(err);
                    } else {
                        return resolve(info);
                    }
                });
            })
                .then((meta) => {
                    return fs.writeJsonAsync(destFile, meta)
                        .return(meta);
                });
        }

        fetchVideos() {
            const videos = [];
            return Promise.resolve(config.get('youtube:playlist:urls'))
                .each((url) => {
                    log.info(`Fetching playlist entries from url: ${url}`);
                    return spawn('youtube-dl', [
                        '-j',
                        '--flat-playlist',
                        url
                    ])
                        .then((res) => {
                            return _.compact(s.lines(res.out))
                                .map((row) => {
                                    return JSON.parse(row);
                                });
                        })
                        .then((res) => {
                            videos.splice(videos.length, 0, ...res);
                        });
                })
                .then(() => {
                    log.info(`Found ${videos.length} playlist entries.`, videos);
                })
                .return(videos);
        }

    };

};

exports['@singleton'] = true;
exports['@require'] = ['config', 'storage', 'log'];
