// /timezone command - sets user's timezone using buttons
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');

// Command definition moved to end of file

// Timezone interaction handlers
async function handleTimezoneButtonInteraction(interaction) {
    const { customId } = interaction;
    
    if (customId.startsWith('region_')) {
        const region = customId.replace('region_', '');
        
        // Handle regions with sub-regions
        if (region === 'americas') {
            const embed = new EmbedBuilder()
                .setTitle('🌎 Americas - Select Sub-Region')
                .setDescription('Choose your sub-region to see available timezones:')
                .setColor(0x00AE86);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('subregion_north_america')
                        .setLabel('🇺🇸 North America')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('subregion_central_america')
                        .setLabel('🇲🇽 Central America')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('subregion_south_america')
                        .setLabel('🇧🇷 South America')
                        .setStyle(ButtonStyle.Primary)
                );

            return await interaction.update({ embeds: [embed], components: [row] });
        }
        
        if (region === 'asia') {
            const embed = new EmbedBuilder()
                .setTitle('🌏 Asia - Select Sub-Region')
                .setDescription('Choose your sub-region to see available timezones:')
                .setColor(0x00AE86);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('subregion_east_asia')
                        .setLabel('🇯🇵 East Asia')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('subregion_southeast_asia')
                        .setLabel('🇸🇬 Southeast Asia')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('subregion_south_west_asia')
                        .setLabel('🇮🇳 South & West Asia')
                        .setStyle(ButtonStyle.Primary)
                );

            return await interaction.update({ embeds: [embed], components: [row] });
        }
        
        let timezones = [];
        let regionName = '';
        
        switch (region) {
            case 'europe':
                regionName = '🇪🇺 Europe';
                timezones = [
                    { label: 'London (GMT/BST)', value: 'Europe/London' },
                    { label: 'Paris (CET/CEST)', value: 'Europe/Paris' },
                    { label: 'Berlin (CET/CEST)', value: 'Europe/Berlin' },
                    { label: 'Madrid (CET/CEST)', value: 'Europe/Madrid' },
                    { label: 'Rome (CET/CEST)', value: 'Europe/Rome' },
                    { label: 'Amsterdam (CET/CEST)', value: 'Europe/Amsterdam' },
                    { label: 'Vienna (CET/CEST)', value: 'Europe/Vienna' },
                    { label: 'Warsaw (CET/CEST)', value: 'Europe/Warsaw' },
                    { label: 'Stockholm (CET/CEST)', value: 'Europe/Stockholm' },
                    { label: 'Moscow (MSK)', value: 'Europe/Moscow' },
                    { label: 'Athens (EET/EEST)', value: 'Europe/Athens' },
                    { label: 'Istanbul (TRT)', value: 'Europe/Istanbul' }
                ];
                break;
            case 'oceania':
                regionName = '🇦🇺 Oceania';
                timezones = [
                    { label: 'Sydney (AEST/AEDT)', value: 'Australia/Sydney' },
                    { label: 'Melbourne (AEST/AEDT)', value: 'Australia/Melbourne' },
                    { label: 'Brisbane (AEST)', value: 'Australia/Brisbane' },
                    { label: 'Perth (AWST)', value: 'Australia/Perth' },
                    { label: 'Adelaide (ACST/ACDT)', value: 'Australia/Adelaide' },
                    { label: 'Darwin (ACST)', value: 'Australia/Darwin' },
                    { label: 'Auckland (NZST/NZDT)', value: 'Pacific/Auckland' },
                    { label: 'Fiji (FJT)', value: 'Pacific/Fiji' },
                    { label: 'Honolulu (HST)', value: 'Pacific/Honolulu' },
                    { label: 'Guam (ChST)', value: 'Pacific/Guam' }
                ];
                break;
            case 'africa':
                regionName = '🌍 Africa';
                timezones = [
                    { label: 'Cairo (EET)', value: 'Africa/Cairo' },
                    { label: 'Lagos (WAT)', value: 'Africa/Lagos' },
                    { label: 'Johannesburg (SAST)', value: 'Africa/Johannesburg' },
                    { label: 'Nairobi (EAT)', value: 'Africa/Nairobi' },
                    { label: 'Casablanca (WET)', value: 'Africa/Casablanca' },
                    { label: 'Tunis (CET)', value: 'Africa/Tunis' },
                    { label: 'Algiers (CET)', value: 'Africa/Algiers' },
                    { label: 'Addis Ababa (EAT)', value: 'Africa/Addis_Ababa' }
                ];
                break;
        }

        const embed = new EmbedBuilder()
            .setTitle(`Select Your Timezone - ${regionName}`)
            .setDescription('Choose your specific timezone:')
            .setColor(0x00AE86);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('timezone_select')
            .setPlaceholder('Choose your timezone...')
            .addOptions(timezones);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.update({ embeds: [embed], components: [row] });
    
    // Handle sub-region buttons
    } else if (customId.startsWith('subregion_')) {
        const subregion = customId.replace('subregion_', '');
        
        let timezones = [];
        let regionName = '';
        
        switch (subregion) {
            case 'north_america':
                regionName = '🇺🇸 North America';
                timezones = [
                    { label: 'New York (EST/EDT)', value: 'America/New_York' },
                    { label: 'Chicago (CST/CDT)', value: 'America/Chicago' },
                    { label: 'Denver (MST/MDT)', value: 'America/Denver' },
                    { label: 'Los Angeles (PST/PDT)', value: 'America/Los_Angeles' },
                    { label: 'Toronto (EST/EDT)', value: 'America/Toronto' },
                    { label: 'Vancouver (PST/PDT)', value: 'America/Vancouver' }
                ];
                break;
            case 'central_america':
                regionName = '🇲🇽 Central America';
                timezones = [
                    { label: 'Mexico City (CST/CDT)', value: 'America/Mexico_City' },
                    { label: 'Guatemala City (CST)', value: 'America/Guatemala' },
                    { label: 'Managua (CST)', value: 'America/Managua' },
                    { label: 'San José (CST)', value: 'America/Costa_Rica' }
                ];
                break;
            case 'south_america':
                regionName = '🇧🇷 South America';
                timezones = [
                    { label: 'São Paulo (BRT)', value: 'America/Sao_Paulo' },
                    { label: 'Buenos Aires (ART)', value: 'America/Buenos_Aires' },
                    { label: 'Lima (PET)', value: 'America/Lima' },
                    { label: 'Bogotá (COT)', value: 'America/Bogota' },
                    { label: 'Santiago (CLT/CLST)', value: 'America/Santiago' },
                    { label: 'Caracas (VET)', value: 'America/Caracas' }
                ];
                break;
            case 'east_asia':
                regionName = '🇯🇵 East Asia';
                timezones = [
                    { label: 'Shanghai (CST)', value: 'Asia/Shanghai' },
                    { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
                    { label: 'Seoul (KST)', value: 'Asia/Seoul' },
                    { label: 'Hong Kong (HKT)', value: 'Asia/Hong_Kong' }
                ];
                break;
            case 'southeast_asia':
                regionName = '🇸🇬 Southeast Asia';
                timezones = [
                    { label: 'Singapore (SGT)', value: 'Asia/Singapore' },
                    { label: 'Bangkok (ICT)', value: 'Asia/Bangkok' },
                    { label: 'Jakarta (WIB)', value: 'Asia/Jakarta' },
                    { label: 'Manila (PHT)', value: 'Asia/Manila' }
                ];
                break;
            case 'south_west_asia':
                regionName = '🇮🇳 South & West Asia';
                timezones = [
                    { label: 'Mumbai/Delhi (IST)', value: 'Asia/Kolkata' },
                    { label: 'Dubai (GST)', value: 'Asia/Dubai' },
                    { label: 'Tehran (IRST)', value: 'Asia/Tehran' },
                    { label: 'Baghdad (AST)', value: 'Asia/Baghdad' }
                ];
                break;
        }

        const embed = new EmbedBuilder()
            .setTitle(`Select Your Timezone - ${regionName}`)
            .setDescription('Choose your specific timezone:')
            .setColor(0x00AE86);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('timezone_select')
            .setPlaceholder('Choose your timezone...')
            .addOptions(timezones);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.update({ embeds: [embed], components: [row] });
    }
}

async function handleTimezoneSelectMenu(interaction) {
    const { customId, values } = interaction;
    
    if (customId === 'timezone_select') {
        // Handle timezone selection
        const selectedTimezone = values[0];
        const userId = interaction.user.id;

        try {
            // Validate timezone
            new Date().toLocaleString('en-US', { timeZone: selectedTimezone });

            let profile = await UserProfile.findOne({ userId });
            if (!profile) {
                profile = new UserProfile({ userId });
            }
            profile.timezoneString = selectedTimezone;
            await profile.save();

            const embed = new EmbedBuilder()
                .setTitle('✅ Timezone Set Successfully')
                .setDescription(`Your timezone has been set to **${selectedTimezone}**`)
                .setColor(0x00FF00);

            await interaction.update({ embeds: [embed], components: [] });
        } catch (err) {
            await interaction.update({ 
                content: 'Error setting timezone. Please try again.', 
                embeds: [], 
                components: [] 
            });
        }
    }
}

// Export the handlers
module.exports = {
    data: new SlashCommandBuilder()
        .setName('timezone')
        .setDescription('Set your timezone using region selection'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🌍 Select Your Region')
            .setDescription('Choose your region to set your timezone:')
            .setColor(0x00AE86);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('region_americas')
                    .setLabel('🌎 Americas')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('region_europe')
                    .setLabel('🇪🇺 Europe')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('region_asia')
                    .setLabel('🌏 Asia')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('region_oceania')
                    .setLabel('🇦🇺 Oceania')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('region_africa')
                    .setLabel('🌍 Africa')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },
    handleTimezoneButtonInteraction,
    handleTimezoneSelectMenu
};
