'use strict'

const http = require('http')
const DigitalOcean = require('do-wrapper')

const validTypes = [ 'A', 'CNAME', 'AAAA' ]

require('dotenv').config()

const secretKey = process.env.SECRET_KEY
    ? process.env.SECRET_KEY
    : 'secret-key'

const serverHost = process.env.SERVER_HOST
    ? process.env.SERVER_HOST
    : '127.0.0.1'

const serverPort = process.env.SERVER_PORT
    ? process.env.SERVER_PORT
    : 3000

const accessToken = process.env.ACCESS_TOKEN
if (!accessToken) throw new Error('No access token')

const domain = process.env.DOMAIN
if (!domain) throw new Error('No domain')

let api = new DigitalOcean(accessToken, 1000)

const server = http.createServer((req, res) => {
    console.log('%s - %s %s', new Date().toISOString(), req.method, req.url)
    res.setHeader('content-type', 'application/json')

    const url = require('url').parse(req.url, true)
    const query = url.query

    if (url.pathname !== '/update') {
        res.statusCode = 404
        res.end('{"error": "not found"}')
        return
    } else if (query.secret !== secretKey) {
        res.statusCode = 403
        res.end('{"error": "forbidden"}')
        return
    } else if (!query.name) {
        res.statusCode = 400
        res.end('{"error": "bad request"}')
        return
    } else {
        fetchDomainRecord(query.name).then((rec) => {
            if (!rec) {
                res.statusCode = 410
                res.end('{"error": "name not found"}')
                return
            }

            return updateDomainRecord(rec, query.data).then((result) => {
                const record = result.body.domain_record
                res.statusCode = 200
                res.end(JSON.stringify({ ok: true, record }))
            })
        }).catch((err) => {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.toString() }))
            console.error('domain update failed: %j', err, err.stack)
        })
    }
})

api.account().then((res) => {
    const { account } = res.body
    console.log('running with account %j', account.email)
    server.listen(serverPort, serverHost, (err) => {
        if (err) {
            console.error('listen failed %s', err.stack)
            process.exit(2)
            return
        }

        console.log('listening at http://%s:%s',
            serverHost, serverPort)
    })
}).catch((err) => {
    console.error(err.stack)
    process.exit(1)
})

function fetchDomainRecord (name) {
    return api.domainRecordsGetAll(domain)
        .then((res) => res.body.domain_records)
        .then((recs) => recs.filter(r => ~validTypes.indexOf(r.type)))
        .then((recs) => recs.find(r => r.name === name))
}

function updateDomainRecord (record, data) {
    const { id, name, type } = record
    console.log('updating %s record %j with %j', type, name, data)
    return api.domainRecordsUpdate(domain, id, { name, type, data })
}

