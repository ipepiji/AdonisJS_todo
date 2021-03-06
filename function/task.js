require('dotenv').config()

const FETCH = require('axios');
const DATABASE = require('../class/Database')

// Function
async function getYoutubeVideoStatistic(access_token, video) {

    try {

        let youtube_video = await FETCH(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${video.id.videoId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${access_token}`,
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "User-Agent": "my program (gzip)"
            }
        });

        youtube_video = youtube_video.data;

        return youtube_video.items[0].statistics;

    } catch (err) {

        console.log(err.response.data.error.message);
        await DB.close();
        console.log("---------------------------FAIL----------------------------");
        process.exit(1);

    }

}

async function getYoutubeVideoComment(access_token, video) {

    try {

        let youtube_video = await FETCH(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&maxResults=100&order=time&videoId=${video.id.videoId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${access_token}`,
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "User-Agent": "my program (gzip)"
            }
        });

        youtube_video = youtube_video.data;

        if (youtube_video.items.length === 0)
            console.log("No comment available!");

        return youtube_video.items;

    } catch (err) {

        console.log(err.response.data.error.message);
        return null;

    }

}

// Set Database based on .env
const CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
};

// Set Constructor
const DB = new DATABASE(CONFIG);

module.exports.getAccessToken = async function getAccessToken(client_id, client_secret, refresh_token) {

    try {

        let credential = await FETCH(`https://oauth2.googleapis.com/token?client_id=${client_id}&client_secret=${client_secret}&refresh_token=${refresh_token}&grant_type=refresh_token`, {
            method: 'POST'
        });

        credential = credential.data;

        return credential.access_token;

    } catch (err) {

        console.log(err.response.data.error.message);
        console.log("---------------------------FAIL----------------------------");
        process.exit(1);

    }

}

module.exports.cronYoutubeVideoDB = async function cronYoutubeVideoDB(access_token) {

    try {

        const EVENT = await DB.query("SELECT * FROM events");

        console.log("---------------------------START---------------------------");
        console.log("******************Fetching YOUTUBE's API*******************");

        for (let w in EVENT) {

            const CANDIDATE = await DB.query("SELECT candidate_name FROM candidates WHERE `event_id` = '" + EVENT[w].event_id + "'");

            for (let x in CANDIDATE) {

                const Q = `${CANDIDATE[x].candidate_name}|${(CANDIDATE[x].candidate_name).toLowerCase()}`;

                let youtube_video = await FETCH(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&order=date&publishedAfter=${EVENT[w].event_start.toISOString()}&publishedBefore=${EVENT[w].event_end.toISOString()}&q=${Q}`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${access_token}`,
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip",
                        "User-Agent": "my program (gzip)"
                    }
                });

                youtube_video = youtube_video.data.items;

                const SOCIAL_MEDIA = await DB.query("SELECT post FROM social_medias WHERE platform = 'Youtube'");

                for (let y in youtube_video) {

                    if (SOCIAL_MEDIA.some(video => video.post === youtube_video[y].snippet.title)) {

                        console.log("Update", youtube_video[y].snippet.title);

                        const STATISTIC = await getYoutubeVideoStatistic(access_token, youtube_video[y]);

                        const COMMENTS = await getYoutubeVideoComment(access_token, youtube_video[y]);

                        const POST = await DB.query(`SELECT id FROM social_medias WHERE platform = "Youtube" AND post = "${youtube_video[y].snippet.title}"`);

                        for (let z in COMMENTS) {

                            if (POST[z]) {

                                const DATETIME = new Date();

                                await DB.query("UPDATE social_medias SET `citizen_comment` = '" + COMMENTS[z].snippet.topLevelComment.snippet.textDisplay + "', `like` = '" + STATISTIC.likeCount + "', `dislike` = '" + STATISTIC.dislikeCount + "', `share` = '" + STATISTIC.viewCount + "', `updated_at` = '" + DATETIME.toISOString() + "' WHERE `id` = '" + POST[z].id + "'");

                            }

                        }

                    }
                    else {

                        console.log("Insert", youtube_video[y].snippet.title);

                        const STATISTIC = await getYoutubeVideoStatistic(access_token, youtube_video[y]);

                        const COMMENTS = await getYoutubeVideoComment(access_token, youtube_video[y]);

                        for (let z in COMMENTS) {

                            const DATETIME = new Date();

                            await DB.query("INSERT INTO social_medias(`platform`,`url`,`candidate`,`post`,`post_date`,`citizen_comment`,`like`,`dislike`,`share`,`created_at`,`updated_at`) VALUES ('Youtube','" + youtube_video[y].id.videoId + "','" + CANDIDATE[x].candidate_name + "','" + youtube_video[y].snippet.title + "','" + youtube_video[y].snippet.publishedAt + "','" + COMMENTS[z].snippet.topLevelComment.snippet.textDisplay + "','" + STATISTIC.likeCount + "','" + STATISTIC.dislikeCount + "','" + STATISTIC.viewCount + "','" + DATETIME.toISOString() + "','" + DATETIME.toISOString() + "')");

                        }

                    }

                }

            }

        }

        console.log("----------------------------END----------------------------");
        console.log("");
        console.log("---------------------------START---------------------------");
        console.log("******************Fetching SHIBA(AI)'s API*****************");

        for (let w in EVENT) {

            let AI_RESULT = await FETCH(`${process.env.SHIBA_URL}/api/sentiment/?start_date=${EVENT[w].event_start.toISOString()}&end_date=${EVENT[w].event_end.toISOString()}&event_id=${EVENT[w].event_id}`, { method: "GET" });

            AI_RESULT = AI_RESULT.data;

            if (AI_RESULT.Warning)
                console.log("Fetching AI's API success but", AI_RESULT.Warning, "- event_id:", EVENT[w].event_id);
            else if (AI_RESULT.Error)
                console.log(AI_RESULT.Error, "- event_id:", EVENT[w].event_id);
            else
                console.log("Fetching AI's API success. - event_id:", EVENT[w].event_id);

        }

        console.log("----------------------------END----------------------------");
        await DB.close();
        return "----------------------------DONE---------------------------";

    } catch (err) {

        console.log(err.response.data.error.message);
        await DB.close();
        console.log("---------------------------FAIL----------------------------");
        process.exit(1);

    }

}