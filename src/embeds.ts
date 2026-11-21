import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
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

function renderModernBar(percent: number, length = 14): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const filled = Math.round((clamped / 100) * length)
  const empty = length - filled
  return `${'▰'.repeat(filled)}${'▱'.repeat(empty)}`
}

function formatEventDate(rawDate?: string | null): string {
  if (!rawDate) return '-'
  const trimmed = String(rawDate).trim()
  if (!trimmed) return '-'

  // Parse YYYY-MM-DD or ISO date into a noon UTC timestamp so date display doesn't shift across timezones
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const unix = Math.floor(
      Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 12, 0, 0) / 1000,
    )
    return `<t:${unix}:D>`
  }
  return trimmed
}

export function getWebUrl(): string | null {
  const raw = (process.env.PREDICTIONS_WEB_URL || '').trim().replace(/\/$/, '')
  return /^https?:\/\//i.test(raw) ? raw : null
}

export function getProfileUrl(user: {
  discord_id: string
  username?: string | null
  display_name?: string | null
}): string | null {
  const webUrl = getWebUrl()
  if (!webUrl) return null
  const slug = user.display_name && user.username ? user.username : user.discord_id
  return `${webUrl}/user/${encodeURIComponent(slug)}`
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
        .setEmoji('⚖️')
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
        .setEmoji('⚖️')
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

function formatMentions(
  winners: Array<{
    discord_id: string
    username?: string | null
    display_name?: string | null
    wins: number
  }>,
  maxDisplay = 20,
): string {
  const shown = winners.slice(0, maxDisplay)
  const lines = shown.map((w) => {
    const profileUrl = getProfileUrl(w)
    const link = profileUrl ? ` [↗](${profileUrl})` : ''
    return `<@${w.discord_id}> (**${w.wins}** pts)${link}`
  })
  if (winners.length > maxDisplay) {
    lines.push(`*… and ${winners.length - maxDisplay} more on the leaderboard*`)
  }
  return lines.join('\n')
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

export function buildPredictionMessagePayload(
  prediction: PredictionDoc,
  overrideStats?: VoteStats,
  options?: { includeButtons?: boolean },
) {
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
  const includeButtons = options?.includeButtons ?? !isLocked
  const pctA = Math.round(stats.votes_a_percent)
  const pctB = Math.round(stats.votes_b_percent)
  const pctDraw = Math.round(stats.votes_draw_percent)

  const totalVotesLabel = `${stats.total_votes} ${stats.total_votes === 1 ? 'vote' : 'votes'}`
  const headerText = new TextDisplayBuilder().setContent(
    [
      isLocked
        ? '-# BEYOND KICKBOXING • 🔒 VOTING LOCKED'
        : '-# BEYOND KICKBOXING • 🟢 VOTING OPEN',
      `## 🥊 ${prediction.fighter_a}  vs.  ${prediction.fighter_b}`,
      `🎟️ **${prediction.event_name || '-'}**  •  📅 ${formatEventDate(prediction.event_date)}  •  🗳️ ${totalVotesLabel}`,
    ].join('\n'),
  )

  const voteLines = [
    `🔴 **${prediction.fighter_a}** — **${pctA}%** *(${stats.votes_a} ${stats.votes_a === 1 ? 'vote' : 'votes'})*`,
    renderModernBar(pctA),
    '',
    `🔵 **${prediction.fighter_b}** — **${pctB}%** *(${stats.votes_b} ${stats.votes_b === 1 ? 'vote' : 'votes'})*`,
    renderModernBar(pctB),
    '',
    `⚪ **Draw / No Contest** — **${pctDraw}%** *(${stats.votes_draw} ${stats.votes_draw === 1 ? 'vote' : 'votes'})*`,
    renderModernBar(pctDraw),
  ]

  if (isLocked) {
    voteLines.push('', '> 🔒 **Voting is locked — no further votes can be placed.**')
  }

  const votesText = new TextDisplayBuilder().setContent(voteLines.join('\n'))

  const container = new ContainerBuilder()
    .setAccentColor(isLocked ? 0xf59e0b : 0xdc3545)
    .addTextDisplayComponents(headerText)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(votesText)

  const rawImage = prediction.image_url || (prediction as any).image
  const resolvedImage = resolveImageUrl(rawImage)
  if (resolvedImage) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(resolvedImage)),
    )
  }

  if (includeButtons) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addActionRowComponents(...buildPredictionComponents(prediction.fighter_a, prediction.fighter_b))
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Prediction #${prediction.id} • 2 pts exact (winner + method) • 1 pt winner or draw`,
    ),
  )

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
  }
}

export function buildEndedMessagePayload(
  prediction: PredictionDoc,
  settlement?: SettlementResult,
) {
  let resultLine: string
  if (prediction.method === 'draw') {
    resultLine = '🤝 **Official Result:** Draw / No Contest'
  } else {
    const winnerName =
      prediction.winner === 'a' ? prediction.fighter_a : prediction.fighter_b
    const winMethod = prediction.method === 'ko' ? 'KO/TKO' : 'Decision'
    resultLine = `🏆 **Official Result:** **${winnerName}** won by **${winMethod}**`
  }

  const headerLines = [
    '-# BEYOND KICKBOXING • 🏁 FINAL RESULT',
    `## 🏆 ${prediction.fighter_a}  vs.  ${prediction.fighter_b}`,
    resultLine,
    ...(settlement ? [`-# 👥 ${settlement.totalParticipants} participants`] : []),
  ]

  const container = new ContainerBuilder().setAccentColor(0x10b981)

  const rawImage = prediction.image_url || (prediction as any).image
  const resolvedImage = resolveImageUrl(rawImage)
  if (resolvedImage) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines.join('\n')))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(resolvedImage)),
    )
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines.join('\n')))
  }

  const bodyLines: string[] = []
  if (settlement) {
    if (settlement.totalParticipants === 0) {
      bodyLines.push('No one participated in this round.')
    } else {
      if (settlement.exactWinners.length > 0) {
        bodyLines.push(`🎯 **Exact Match (+2 pts)**\n${formatMentions(settlement.exactWinners)}`)
      }
      if (settlement.winners.length > 0) {
        if (bodyLines.length > 0) bodyLines.push('')
        bodyLines.push(`✅ **Correct Winner / Draw (+1 pt)**\n${formatMentions(settlement.winners)}`)
      }
      if (settlement.exactWinners.length === 0 && settlement.winners.length === 0) {
        bodyLines.push('😅 Argh! No one guessed right. Better luck next time!')
      }
    }
  }

  if (bodyLines.length > 0) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join('\n')))
  }

  const webUrl = getWebUrl()
  if (webUrl) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('View Leaderboard & History')
            .setEmoji('🌐')
            .setStyle(ButtonStyle.Link)
            .setURL(`${webUrl}/leaderboard`),
        ),
      )
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Prediction #${prediction.id} • ${prediction.event_name || ''}`,
    ),
  )

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
  }
}

export function buildLeaderboardMessagePayload(
  entries: Array<{
    rank: number
    discord_id: string
    username: string | null
    display_name?: string | null
    wins: number
    participations: number
    rating?: number
    avg?: number
  }>,
  sortMode: 'rating' | 'points' = 'rating',
) {
  const medal = (rank: number) =>
    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**#${rank}**`

  const lines = entries.map((u) => {
    const profileUrl = getProfileUrl(u)
    const link = profileUrl ? ` [↗](${profileUrl})` : ''
    const ratingStr =
      typeof u.rating === 'number' ? `Rating **${u.rating.toFixed(2)}** · ` : ''
    return `${medal(u.rank)} <@${u.discord_id}>${link} — ${ratingStr}**${u.wins}** pts *(${u.participations} rounds)*`
  })

  const sortLabel = sortMode === 'points' ? 'TOTAL POINTS' : 'FAIR RATING'
  const container = new ContainerBuilder()
    .setAccentColor(0xdc3545)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `-# BEYOND KICKBOXING • 🏆 TOP 10 BY ${sortLabel}`,
          '## Predictions Leaderboard',
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))

  const webUrl = getWebUrl()
  if (webUrl) {
    const leaderboardUrl =
      sortMode === 'points' ? `${webUrl}/leaderboard?sort=points` : `${webUrl}/leaderboard`
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('Open Full Leaderboard')
            .setEmoji('🌐')
            .setStyle(ButtonStyle.Link)
            .setURL(leaderboardUrl),
        ),
      )
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
  }
}

export function buildPointsMessagePayload(
  user: {
    discord_id: string
    rank: number | null
    wins: number
    participations: number
    rating?: number
    avg?: number
  },
  linksRow: ActionRowBuilder<ButtonBuilder> | null,
) {
  const rankStr = user.rank ? `#${user.rank}` : 'Unranked'
  const ratingStr = typeof user.rating === 'number' ? user.rating.toFixed(2) : '—'
  const avgStr = typeof user.avg === 'number' ? user.avg.toFixed(2) : '—'

  const container = new ContainerBuilder()
    .setAccentColor(0xdc3545)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '-# BEYOND KICKBOXING • 🎯 YOUR STATS',
          `## Rank ${rankStr}`,
          [
            `⭐ **Fair Rating:** ${ratingStr}`,
            `🏆 **Total Points:** ${user.wins}`,
            `🥊 **Rounds Played:** ${user.participations}`,
            `📈 **Avg / Round:** ${avgStr}`,
          ].join('\n'),
        ].join('\n'),
      ),
    )

  if (linksRow) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addActionRowComponents(linksRow)
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  }
}

export function buildActivePredictionsMessagePayload(
  predictions: PredictionDoc[],
  guildId?: string | null,
) {
  const blocks = predictions.map((pred) => {
    const s = pred.stats || {
      votes_a: 0,
      votes_b: 0,
      votes_draw: 0,
      total_votes: 0,
      votes_a_percent: 0,
      votes_b_percent: 0,
      votes_draw_percent: 0,
    }
    const jumpUrl =
      guildId && pred.discord_channel_id && pred.discord_message_id
        ? ` [Jump to Poll ↗](https://discord.com/channels/${guildId}/${pred.discord_channel_id}/${pred.discord_message_id})`
        : ''

    return [
      `**🥊 ${pred.fighter_a} vs. ${pred.fighter_b}** *(#${pred.id})*${jumpUrl}`,
      `-# 🎟️ ${pred.event_name || '-'} • 📅 ${formatEventDate(pred.event_date)} • 🗳️ ${s.total_votes} votes`,
      `🔴 ${pred.fighter_a}: **${Math.round(s.votes_a_percent)}%** (${s.votes_a})  ·  🔵 ${pred.fighter_b}: **${Math.round(s.votes_b_percent)}%** (${s.votes_b})  ·  ⚪ Draw: **${Math.round(s.votes_draw_percent)}%** (${s.votes_draw})`,
    ].join('\n')
  })

  const container = new ContainerBuilder()
    .setAccentColor(0xdc3545)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `-# BEYOND KICKBOXING • 🟢 ${predictions.length} ACTIVE ${predictions.length === 1 ? 'PREDICTION' : 'PREDICTIONS'}`,
          '## Active Predictions',
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(blocks.join('\n\n')))

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  }
}
