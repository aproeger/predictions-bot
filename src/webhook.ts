import http from 'node:http'
import type { Client, TextBasedChannel } from 'discord.js'
import type { ApiClient, PredictionDoc, SettlementResult, VoteStats } from './api.js'
import {
  buildEndedEmbed,
  buildPredictionComponents,
  buildPredictionEmbed,
} from './embeds.js'

interface WebhookPayload {
  event: 'created' | 'updated' | 'deleted' | 'voted'
  prediction?: PredictionDoc
  stats?: VoteStats
  settlement?: SettlementResult
}

async function fetchDiscordMessage(
  client: Client,
  channelId?: string | null,
  messageId?: string | null,
) {
  if (!channelId || !messageId) return null
  try {
    const channel = await client.channels.fetch(channelId)
    if (!channel || !channel.isTextBased()) return null
    return await (channel as TextBasedChannel).messages.fetch(messageId)
  } catch (err) {
    console.warn(`Could not fetch message ${messageId} in channel ${channelId}:`, err)
    return null
  }
}

export function startWebhookServer(params: {
  client: Client
  api: ApiClient
  secret: string
  port: number
  defaultChannelId?: string
}) {
  const { client, api, secret, port, defaultChannelId } = params

  const server = http.createServer(async (req, res) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', ready: client.isReady() }))
      return
    }

    if (req.method !== 'POST' || req.url !== '/webhook/predictions') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    if (secret && req.headers['x-bot-secret'] !== secret) {
      console.warn('[webhook] Unauthorized request (x-bot-secret mismatch)')
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk))
    }

    let payload: WebhookPayload
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON' }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))

    // Handle asynchronously
    console.log(`[webhook] Received event=${payload.event} prediction=${payload.prediction?.id}`)
    handleWebhook(client, api, payload, defaultChannelId).catch((err) => {
      console.error('[webhook] Handler error:', err)
    })
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`Webhook server listening on http://0.0.0.0:${port}/webhook/predictions`)
  })

  return server
}

async function handleWebhook(
  client: Client,
  api: ApiClient,
  data: WebhookPayload,
  defaultChannelId?: string,
) {
  const prediction = data.prediction
  if (!prediction) return

  if (data.event === 'created') {
    if (prediction.discord_message_id || !defaultChannelId) return
    const channel = await client.channels.fetch(defaultChannelId)
    if (!channel || !channel.isTextBased() || !('send' in channel)) return

    const message = await channel.send({
      embeds: [buildPredictionEmbed(prediction, data.stats)],
      components: buildPredictionComponents(prediction.fighter_a, prediction.fighter_b),
    })

    await api.attachMessage(prediction.id, message.id, channel.id)
    return
  }

  if (data.event === 'voted') {
    const msg = await fetchDiscordMessage(
      client,
      prediction.discord_channel_id,
      prediction.discord_message_id,
    )
    if (msg) {
      await msg.edit({
        embeds: [buildPredictionEmbed(prediction, data.stats)],
      })
    }
    return
  }

  if (data.event === 'updated') {
    const msg = await fetchDiscordMessage(
      client,
      prediction.discord_channel_id,
      prediction.discord_message_id,
    )

    if (prediction.status === 'locked' && msg) {
      const fullRes = await api.getByMessage(prediction.discord_message_id!)
      await msg.edit({
        embeds: [buildPredictionEmbed(fullRes.prediction)],
        components: [],
      })
    } else if (prediction.status === 'ended') {
      if (msg) {
        try {
          await msg.delete()
        } catch (delErr) {
          console.warn('[webhook:ended] Could not delete original message:', delErr)
        }
      }
      const targetChannelId = prediction.discord_channel_id || defaultChannelId
      console.log(
        `[webhook:ended] prediction=${prediction.id} channel=${targetChannelId || 'NONE'} hasSettlement=${Boolean(data.settlement)}`,
      )
      if (targetChannelId) {
        const channel = await client.channels.fetch(targetChannelId)
        if (channel && channel.isTextBased() && 'send' in channel) {
          await channel.send({
            embeds: [buildEndedEmbed(prediction, data.settlement)],
          })
        }
      }
    } else if (prediction.status === 'active' && msg) {
      await msg.edit({
        embeds: [buildPredictionEmbed(prediction, data.stats)],
        components: buildPredictionComponents(prediction.fighter_a, prediction.fighter_b),
      })
    }
    return
  }

  if (data.event === 'deleted') {
    const msg = await fetchDiscordMessage(
      client,
      prediction.discord_channel_id,
      prediction.discord_message_id,
    )
    if (msg) await msg.delete()
  }
}
