const { SlashCommand } = require('@eartharoid/dbf');
const { ApplicationCommandOptionType } = require('discord.js');
const ExtendedEmbedBuilder = require('../../lib/embed');
const { isStaff } = require('../../lib/users');
const { logTicketEvent } = require('../../lib/logging');

module.exports = class RemoveSlashCommand extends SlashCommand {
	constructor(client, options) {
		const name = 'remove';
		super(client, {
			...options,
			description: client.i18n.getMessage(null, `commands.slash.${name}.description`),
			descriptionLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.description`),
			dmPermission: false,
			name,
			nameLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.name`),
			options: [
				{
					name: 'member',
					required: true,
					type: ApplicationCommandOptionType.User,
				},
				{
					autocomplete: true,
					name: 'ticket',
					required: false,
					type: ApplicationCommandOptionType.String,
				},
			].map(option => {
				option.descriptionLocalizations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.description`);
				option.description = option.descriptionLocalizations['en-GB'];
				option.nameLocalizations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.name`);
				return option;
			}),
		});
	}

	/**
	 * @param {import("discord.js").ChatInputCommandInteraction} interaction
	 */
	async run(interaction) {
		/** @type {import("client")} */
		const client = this.client;

		await interaction.deferReply({ ephemeral: true });

		const ticket = await client.prisma.ticket.findUnique({
			include: { guild: true },
			where: { id: interaction.options.getString('ticket', false) || interaction.channel.id },
		});

		if (!ticket) {
			const settings = await client.prisma.guild.findUnique({ where: { id: interaction.guild.id } });
			const getMessage = client.i18n.getLocale(settings.locale);
			return await interaction.editReply({
				content: getMessage('misc.invalid_ticket.description')
			});
		}

		const getMessage = client.i18n.getLocale(ticket.guild.locale);

		if (
			ticket.id !== interaction.channel.id &&
			ticket.createdById !== interaction.member.id &&
			!(await isStaff(interaction.guild, interaction.member.id))
		) {
			return await interaction.editReply({
				content: getMessage('commands.slash.add.not_staff.description')
			});
		}

		/** @type {import("discord.js").TextChannel} */
		const ticketChannel = await interaction.guild.channels.fetch(ticket.id);
		const member = interaction.options.getMember('member', true);

		if (member.id === client.user.id || member.id === ticket.createdById) {
			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder()
						.setColor(ticket.guild.errorColour)
						.setTitle('❌'),
				],
			});
		}

		await ticketChannel.permissionOverwrites.delete(member, `${interaction.user.tag} removed ${member.user.tag} from the ticket`);

		await ticketChannel.send({
			content: getMessage('commands.slash.remove.removed', {
				removed: member.toString(),
				by: interaction.member.displayName
			})
		});

		await interaction.editReply({
			content: getMessage('commands.slash.remove.success.description', {
				member: member.displayName,
				ticket: ticketChannel.toString()
			})
		});

		logTicketEvent(this.client, {
			action: 'update',
			diff: {
				original: { [getMessage('log.ticket.removed')]: member.user.tag },
				updated: {},
			},
			target: {
				id: ticket.id,
				name: `<#${ticket.id}>`,
			},
			userId: interaction.user.id,
		});
	}
};