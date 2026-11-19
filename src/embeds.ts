import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js'
import type { PredictionDoc, SettlementResult, VoteStats } from './api.js'

function truncateLabel(text: string, maxLength = 80): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function renderProgressBar(percent: number, filledChar: string, length = 10): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const filled = Math.round((clamped / 100) * length)
  const empty = length - filled
  return `${filledChar.repeat(filled)}${'⬛'.repeat(empty)}`
}

export function getWebUrl(): string | null {
  const raw = (process.env.PREDICTIONS_WEB_URL || '').trim().replace(/\/$/, '')
  return /^https?:\/\//i.test(raw) ? raw : null
}

function formatWithBase(base: string, pathOrFilename: string): string {
  const clean = pathOrFilename.replace(/^\/+/, '')

  // If base already includes '/api/media/file' (e.g. https://beyondkick.com/_ipx/_/api/media/file)
  if (base.endsWith('/api/media/file')) {
    const filename = clean.replace(
      /^(api\/media\/file\/|_ipx\/_\/api\/media\/file\/|uploads\/)/,
      '',
    )
    return `${base}/${filename}`
  }

  // If pathOrFilename already contains 'api/media/file'
  if (clean.startsWith('api/media/file/') || clean.startsWith('_ipx/')) {
    const withoutIpx = clean.replace(/^_ipx\/_\//, '')
    return `${base}/${withoutIpx}`
  }

  // If base is an _ipx endpoint without /api/media/file suffix, ensure /api/media/file/ is added
  if (base.includes('/_ipx/')) {
    const filename = clean.replace(/^(api\/media\/file\/|uploads\/)/, '')
    return `${base}/api/media/file/${filename}`
  }

  return `${base}/${clean}`
}

function isInternalOrLocalUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr)
    const host = parsed.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      !host.includes('.') || // Docker service names like "backend", "payload", "kicknews-backend"
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return true
    }
    return false
  } catch {
    return false
  }
}

export function resolveImageUrl(rawUrl?: any): string | null {
  if (!rawUrl) return null
  let trimmed: string = ''
  if (typeof rawUrl === 'string') {
    trimmed = rawUrl.trim()
  } else if (typeof rawUrl === 'object' && rawUrl.url && typeof rawUrl.url === 'string') {
    trimmed = rawUrl.url.trim()
  } else {
    return null
  }
  if (!trimmed) return null

  // Reject bare numeric Payload Media IDs (e.g. "4628") or URLs ending in a bare media ID (e.g. ".../api/media/file/4628")
  if (/^\d+$/.test(trimmed) || /\/(?:api\/media\/file|uploads)\/\d+$/i.test(trimmed)) {
    return null
  }

  const publicBase = (process.env.PUBLIC_MEDIA_URL || '').trim().replace(/\/+$/, '')

  // If already an absolute http/https URL:
  if (/^https?:\/\//i.test(trimmed)) {
    // If pointing to localhost, private IP, or internal Docker hostname, rewrite with public base if available
    if (isInternalOrLocalUrl(trimmed)) {
      if (!publicBase) return null
      try {
        const parsed = new URL(trimmed)
        return formatWithBase(publicBase, parsed.pathname)
      } catch {
        return null
      }
    }
    return trimmed
  }

  if (!publicBase) return null

  return formatWithBase(publicBase, trimmed)
}

export function buildPredictionComponents(
  fighterA: string,
  fighterB: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const webUrl = getWebUrl()
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('draw')
      .setEmoji('🤝')
      .setLabel('Draw / No Contest')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('my_vote')
      .setEmoji('🎯')
      .setLabel('My Vote')
      .setStyle(ButtonStyle.Success),
  )

  if (webUrl) {
    row3.addComponents(
      new ButtonBuilder()
        .setLabel('Vote on Web')
        .setEmoji('🌐')
        .setStyle(ButtonStyle.Link)
        .setURL(webUrl),
    )
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('a_ko')
        .setEmoji('💥')
        .setLabel(truncateLabel(`${fighterA} • KO/TKO`))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('a_dec')
        .setEmoji('📋')
        .setLabel(truncateLabel(`${fighterA} • Decision`))
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('b_ko')
        .setEmoji('💥')
        .setLabel(truncateLabel(`${fighterB} • KO/TKO`))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('b_dec')
        .setEmoji('📋')
        .setLabel(truncateLabel(`${fighterB} • Decision`))
        .setStyle(ButtonStyle.Primary),
    ),
    row3,
  ]
}

export function buildPredictionEmbed(
  prediction: PredictionDoc,
  overrideStats?: VoteStats,
): EmbedBuilder {
  const stats = overrideStats || prediction.stats || {
    votes_a: 0,
    votes_b: 0,
    votes_draw: 0,
    total_votes: 0,
    votes_a_percent: 0,
    votes_b_percent: 0,
    votes_draw_percent: 0,
  }

  const isLocked = prediction.status === 'locked'
  const pctA = Math.round(stats.votes_a_percent)
  const pctB = Math.round(stats.votes_b_percent)
  const pctDraw = Math.round(stats.votes_draw_percent)

  const lines = [
    `**${prediction.fighter_a}**`,
    `${renderProgressBar(pctA, '🟥')} **${pctA}%** (${stats.votes_a} ${stats.votes_a === 1 ? 'vote' : 'votes'})`,
    '',
    `**${prediction.fighter_b}**`,
    `${renderProgressBar(pctB, '🟦')} **${pctB}%** (${stats.votes_b} ${stats.votes_b === 1 ? 'vote' : 'votes'})`,
    '',
    `**Draw / No Contest**`,
    `${renderProgressBar(pctDraw, '⬜')} **${pctDraw}%** (${stats.votes_draw} ${stats.votes_draw === 1 ? 'vote' : 'votes'})`,
  ]

  if (isLocked) {
    lines.push('', '🔒 **Voting is locked — no further votes can be placed.**')
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Beyond Kickboxing • Community Predictions' })
    .setTitle(
      isLocked
        ? `🔒 ${prediction.fighter_a}  vs.  ${prediction.fighter_b}`
        : `🥊 ${prediction.fighter_a}  vs.  ${prediction.fighter_b}`,
    )
    .setDescription(lines.join('\n'))
    .setColor(isLocked ? 0xf59e0b : 0xdc3545)
    .addFields(
      { name: '📅 Event', value: String(prediction.event_name || '-'), inline: true },
      { name: '🗓️ Date', value: String(prediction.event_date || '-'), inline: true },
      { name: '🗳️ Total Votes', value: String(stats.total_votes), inline: true },
    )
    .setFooter({
      text: `Prediction #${prediction.id} • 2 pts exact (winner + method) • 1 pt winner or draw`,
    })
    .setTimestamp()

  const rawImage = prediction.image_url || (prediction as any).image
  const resolvedImage = resolveImageUrl(rawImage)
  if (resolvedImage) {
    embed.setImage(resolvedImage)
  }

  return embed
}

function formatMentions(winners: Array<{ discord_id: string; wins: number }>): string {
  return winners.map((w) => `<@${w.discord_id}> (**${w.wins}** pts)`).join('\n')
}

export function buildEndedEmbed(
  prediction: PredictionDoc,
  settlement?: SettlementResult,
): EmbedBuilder {
  let resultLine: string
  if (prediction.method === 'draw') {
    resultLine = '🤝 **Official Result:** Draw / No Contest'
  } else {
    const winnerName =
      prediction.winner === 'a' ? prediction.fighter_a : prediction.fighter_b
    const winMethod = prediction.method === 'ko' ? 'KO/TKO' : 'Decision'
    resultLine = `🏆 **Official Result:** **${winnerName}** won by **${winMethod}**`
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Beyond Kickboxing • Prediction Result' })
    .setTitle(`🏁 ${prediction.fighter_a}  vs.  ${prediction.fighter_b}`)
    .setColor(0x10b981)
    .setFooter({
      text: `Prediction #${prediction.id} • ${prediction.event_name || ''}`,
    })
    .setTimestamp()

  const rawImage = prediction.image_url || (prediction as any).image
  const resolvedImage = resolveImageUrl(rawImage)
  if (resolvedImage) {
    embed.setThumbnail(resolvedImage)
  }

  const descriptionParts = [resultLine]

  if (settlement) {
    if (settlement.totalParticipants === 0) {
      descriptionParts.push('', 'No one participated in this round.')
    } else {
      if (settlement.exactWinners.length > 0) {
        embed.addFields({
          name: '🎯 Exact Match (+2 pts)',
          value: formatMentions(settlement.exactWinners),
          inline: false,
        })
      }
      if (settlement.winners.length > 0) {
        embed.addFields({
          name: '✅ Correct Winner / Draw (+1 pt)',
          value: formatMentions(settlement.winners),
          inline: false,
        })
      }
      if (settlement.exactWinners.length === 0 && settlement.winners.length === 0) {
        descriptionParts.push('', '😅 Argh! No one guessed right. Better luck next time!')
      }
    }
  }

  const webUrl = getWebUrl()
  if (webUrl) {
    descriptionParts.push(
      '',
      `🌐 [View Leaderboard & Your Voting History](${webUrl}/leaderboard)`,
    )
  }

  embed.setDescription(descriptionParts.join('\n'))
  return embed
}
