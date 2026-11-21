import 'dotenv/config'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type TextBasedChannel,
} from 'discord.js'
import { ApiClient, ApiError } from './api.js'
import { registerCommands } from './commands.js'
import {
  buildEndedMessagePayload,
  buildPredictionEmbed,
  buildPredictionMessagePayload,
  getProfileUrl,
  getWebUrl,
} from './embeds.js'
import { startWebhookServer } from './webhook.js'

const TOKEN = (process.env.BOT_TOKEN || '').trim().replace(/^Bot\s+/i, '')
const GUILD_IDS = (process.env.GUILD_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL || 'http://localhost:3003/api'
const PREDICTIONS_BOT_SECRET = process.env.PREDICTIONS_BOT_SECRET || ''
const PREDICTIONS_CHANNEL_ID = process.env.PREDICTIONS_CHANNEL_ID || undefined
const BOT_WEBHOOK_PORT = Number(process.env.BOT_WEBHOOK_PORT || '8081')

if (!TOKEN) {
  console.error('Error: BOT_TOKEN is required in .env')
  process.exit(1)
}

const api = new ApiClient(PAYLOAD_API_URL, PREDICTIONS_BOT_SECRET)

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
})

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`)
  try {
    await registerCommands(readyClient.application.id, TOKEN, GUILD_IDS)
  } catch (err) {
    console.error('Failed to register slash commands:', err)
  }

  startWebhookServer({
    client: readyClient,
    api,
    secret: PREDICTIONS_BOT_SECRET,
    port: BOT_WEBHOOK_PORT,
    defaultChannelId: PREDICTIONS_CHANNEL_ID,
  })
})

async function fetchMessage(channelId?: string | null, messageId?: string | null) {
  if (!channelId || !messageId) return null
  try {
    const ch = await client.channels.fetch(channelId)
    if (!ch || !ch.isTextBased()) return null
    return await (ch as TextBasedChannel).messages.fetch(messageId)
  } catch {
    return null
  }
}

function buildUserLinksRow(
  user: { discord_id: string; username?: string | null; display_name?: string | null },
  myVotesLabel = 'My Votes',
): ActionRowBuilder<ButtonBuilder> | null {
  const webUrl = getWebUrl()
  const profileUrl = getProfileUrl(user)
  const buttons: ButtonBuilder[] = []

  if (profileUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Public Profile')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Link)
        .setURL(profileUrl),
    )
  }
  if (webUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel(myVotesLabel)
        .setEmoji('📊')
        .setStyle(ButtonStyle.Link)
        .setURL(`${webUrl}/my-votes`),
    )
  }

  return buttons.length > 0 ? new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons) : null
}

async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName === 'leaderboard') {
    try {
      const res = await api.getLeaderboard(10)
      if (!res.leaderboard.length) {
        return interaction.reply({
          content: 'No leaderboard entries yet.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const lines = res.leaderboard.map((u) => {
        const profileUrl = getProfileUrl(u)
        const profileLink = profileUrl ? ` · [Profile](${profileUrl})` : ''
        return `#${u.rank}: <@${u.discord_id}> with **${u.wins} points** (${u.participations} rounds played)${profileLink}`
      })
      const webUrl = getWebUrl()
      const embed = new EmbedBuilder()
        .setTitle('Predictions Leaderboard')
        .setDescription(
          lines.join('\n') +
            (webUrl ? `\n\n🌐 [Open Full Leaderboard](${webUrl}/leaderboard)` : ''),
        )
        .setColor(0xdc3545)
      return interaction.reply({ embeds: [embed] })
    } catch (err: any) {
      return interaction.reply({
        content: `An error occurred: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  }

  if (interaction.commandName === 'points') {
    try {
      const res = await api.getMe(interaction.user.id)
      const linksRow = buildUserLinksRow(
        {
          discord_id: interaction.user.id,
          username: res.user.username || interaction.user.username,
          display_name: res.user.display_name || interaction.user.globalName || interaction.user.username,
        },
        'My Votes & History',
      )
      const rankStr = res.user.rank ? `#${res.user.rank}` : 'unranked'
      return interaction.reply({
        content: `You are ranked **${rankStr}** with **${res.user.wins} points** (**${res.user.participations}** rounds played).`,
        components: linksRow ? [linksRow] : [],
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      return interaction.reply({
        content: `An error occurred: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  }

  if (interaction.commandName !== 'prediction') return
  const sub = interaction.options.getSubcommand()

  if (sub === 'start') {
    await interaction.deferReply()
    const fighter_a = interaction.options.getString('fighter_a', true)
    const fighter_b = interaction.options.getString('fighter_b', true)
    const event_name = interaction.options.getString('event_name', true)
    const event_date = interaction.options.getString('event_date', true)
    const image_url = interaction.options.getString('image_url') || undefined

    try {
      const res = await api.createPrediction({
        fighter_a,
        fighter_b,
        event_name,
        event_date,
        image_url,
      })
      const message = await interaction.editReply(
        buildPredictionMessagePayload(res.prediction),
      )
      await api.attachMessage(res.prediction.id, message.id, message.channelId)
    } catch (err: any) {
      await interaction.editReply(`Error creating prediction: ${err.message}`)
    }
    return
  }

  if (sub === 'lock') {
    const predictionId = interaction.options.getInteger('prediction_id', true)
    try {
      const res = await api.lockPrediction(predictionId)
      const msg = await fetchMessage(
        res.prediction.discord_channel_id || interaction.channelId,
        res.prediction.discord_message_id,
      )
      if (msg) {
        if (msg.flags?.has(MessageFlags.IsComponentsV2)) {
          await msg.edit(
            buildPredictionMessagePayload(res.prediction, undefined, { includeButtons: false }),
          )
        } else {
          await msg.edit({
            embeds: [buildPredictionEmbed(res.prediction)],
            components: [],
          })
        }
      }
      await interaction.reply({ content: 'Prediction locked.', flags: MessageFlags.Ephemeral })
    } catch (err: any) {
      await interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral })
    }
    return
  }

  if (sub === 'end') {
    await interaction.deferReply()
    const predictionId = interaction.options.getInteger('prediction_id', true)
    const winner = interaction.options.getString('winner', true)
    const method = interaction.options.getString('method', true)

    try {
      const res = await api.endPrediction(predictionId, winner, method)
      const msg = await fetchMessage(
        res.prediction.discord_channel_id || interaction.channelId,
        res.prediction.discord_message_id,
      )
      if (msg) await msg.delete()

      await interaction.editReply(buildEndedMessagePayload(res.prediction, res.settlement))
    } catch (err: any) {
      await interaction.editReply(err.message)
    }
    return
  }

  if (sub === 'delete') {
    const predictionId = interaction.options.getInteger('prediction_id', true)
    const force = interaction.options.getString('force') === 'y'
    try {
      const res = await api.deletePrediction(predictionId, force)
      const msg = await fetchMessage(
        res.prediction.discord_channel_id || interaction.channelId,
        res.prediction.discord_message_id,
      )
      if (msg) await msg.delete()

      await interaction.reply({ content: 'Prediction deleted.', flags: MessageFlags.Ephemeral })
    } catch (err: any) {
      await interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral })
    }
    return
  }

  if (sub === 'active') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    try {
      const res = await api.listPredictions('active')
      if (!res.docs.length) {
        return interaction.editReply('No active predictions found.')
      }

      const lines = [
        'Active Predictions',
        'Here are all the currently active predictions and their votes:\n',
      ]
      for (const pred of res.docs) {
        const s = pred.stats!
        lines.push(`**${pred.fighter_a} vs. ${pred.fighter_b}** [#${pred.id}]`)
        lines.push(`Total Votes: ${s.total_votes}`)
        lines.push(`Votes for A: ${s.votes_a} (${Math.round(s.votes_a_percent)}%)`)
        lines.push(`Votes for B: ${s.votes_b} (${Math.round(s.votes_b_percent)}%)`)
        lines.push(`Votes for draw: ${s.votes_draw} (${Math.round(s.votes_draw_percent)}%)\n`)
      }
      await interaction.editReply(lines.join('\n'))
    } catch (err: any) {
      await interaction.editReply(`An error occurred: ${err.message}`)
    }
  }
}

async function handleButton(interaction: ButtonInteraction) {
  const customId = interaction.customId
  if (!['my_vote', 'a_ko', 'a_dec', 'b_ko', 'b_dec', 'draw'].includes(customId)) return

  let prediction
  try {
    const res = await api.getByMessage(interaction.message.id)
    prediction = res.prediction
  } catch {
    return interaction.reply({
      content: 'An error occurred. Please try again later.',
      flags: MessageFlags.Ephemeral,
    })
  }

  if (customId === 'my_vote') {
    try {
      const listRes = await api.listPredictions('open', interaction.user.id)
      const matched = listRes.docs.find((p) => String(p.id) === String(prediction.id))
      const myVote = matched?.my_vote
      if (!myVote) {
        return interaction.reply({
          content: "You haven't voted in this prediction yet.",
          flags: MessageFlags.Ephemeral,
        })
      }
      if (myVote.method === 'draw') {
        return interaction.reply({
          content: 'You voted for a **draw / no-contest**.',
          flags: MessageFlags.Ephemeral,
        })
      }
      const fighterName =
        myVote.fighter === 'a' ? prediction.fighter_a : prediction.fighter_b
      return interaction.reply({
        content: `You voted for **${fighterName}** by **${myVote.method.toUpperCase()}**.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      return interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral })
    }
  }

  let fighter: 'a' | 'b' | null = null
  let method: 'ko' | 'dec' | 'draw' = 'draw'
  let replyText =
    'You voted for a **draw / no-contest**. Good luck, you can change your vote as long as the prediction has not been locked.'

  if (customId !== 'draw') {
    fighter = customId.startsWith('a') ? 'a' : 'b'
    method = customId.endsWith('ko') ? 'ko' : 'dec'
    const fighterName = fighter === 'a' ? prediction.fighter_a : prediction.fighter_b
    replyText = `You voted for **${fighterName}** by **${method.toUpperCase()}**. Good luck, you can change your vote as long as the prediction has not been locked.`
  }

  try {
    const voteRes = await api.vote({
      prediction_id: prediction.id,
      discord_id: interaction.user.id,
      username: interaction.user.username,
      display_name: interaction.user.globalName || interaction.user.username,
      avatar: interaction.user.displayAvatarURL(),
      fighter,
      method,
    })

    const linksRow = buildUserLinksRow({
      discord_id: interaction.user.id,
      username: interaction.user.username,
      display_name: interaction.user.globalName || interaction.user.username,
    })

    await interaction.reply({
      content: replyText,
      components: linksRow ? [linksRow] : [],
      flags: MessageFlags.Ephemeral,
    })
    try {
      if (interaction.message.flags?.has(MessageFlags.IsComponentsV2)) {
        await interaction.message.edit(
          buildPredictionMessagePayload(prediction, voteRes.stats),
        )
      } else {
        await interaction.message.edit({
          embeds: [buildPredictionEmbed(prediction, voteRes.stats)],
        })
      }
    } catch (editErr) {
      console.error('[button] Failed to edit prediction embed:', editErr)
    }
  } catch (err: any) {
    const msg = err instanceof ApiError ? err.message : 'Could not save vote.'
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral })
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction)
  } else if (interaction.isButton()) {
    await handleButton(interaction)
  }
})

client.login(TOKEN)
