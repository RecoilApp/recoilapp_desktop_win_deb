/**
 * Game Detection Module for RecoilApp Desktop
 *
 * Detects running games using multiple strategies:
 *   1. Process name matching against a curated database
 *   2. Window title matching on Windows (tasklist /V)
 *   3. Steam library scanning — detects ANY installed Steam game automatically
 *   4. Fallback: Unreal Engine / Unity game-like processes via heuristic
 *
 * When a match is found, fires a callback with the game info.
 * When the game exits, fires a clear callback.
 */
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

// ── Top 200+ Games Database ─────────────────────────────────
// Each entry maps one or more process names to a display name.
// Process names are lowercase for case-insensitive matching.
const GAME_DATABASE = [
  // ── Battle Royale / Shooters ──
  { processes: ['fortnite', 'fortniteclient-win64-shipping', 'fortniteclient-win64-shipping.exe'], name: 'Fortnite' },
  { processes: ['valorant', 'valorant-win64-shipping', 'valorant.exe'], name: 'VALORANT' },
  { processes: ['csgo', 'cs2', 'csgo.exe', 'cs2.exe'], name: 'Counter-Strike 2' },
  { processes: ['apex_legends', 'r5apex', 'r5apex.exe'], name: 'Apex Legends' },
  { processes: ['pubg', 'tslgame', 'tslgame.exe'], name: 'PUBG: Battlegrounds' },
  { processes: ['overwatch', 'overwatch.exe', 'overwatch2'], name: 'Overwatch 2' },
  { processes: ['cod', 'modernwarfare', 'cod.exe', 'blackops6'], name: 'Call of Duty' },
  { processes: ['rainbow6', 'rainbowsix', 'rainbowsix_vulkan', 'rainbowsix.exe'], name: 'Rainbow Six Siege' },
  { processes: ['escapefromtarkov', 'escapefromtarkov.exe'], name: 'Escape from Tarkov' },
  { processes: ['destiny2', 'destiny2.exe'], name: 'Destiny 2' },
  { processes: ['helldivers2', 'helldivers2.exe'], name: 'Helldivers 2' },
  { processes: ['xdefiant', 'xdefiant.exe'], name: 'XDefiant' },
  { processes: ['splitgate', 'portalgame-win64-shipping'], name: 'Splitgate' },
  { processes: ['thefinals', 'thefinals.exe', 'discovery-win64-shipping'], name: 'THE FINALS' },
  { processes: ['deadlock', 'deadlock.exe', 'project8-win64-shipping'], name: 'Deadlock' },
  { processes: ['battlefield', 'bf2042', 'bf1', 'bfv'], name: 'Battlefield' },
  { processes: ['warframe', 'warframe.x64', 'warframe.exe'], name: 'Warframe' },
  { processes: ['paladins', 'paladins.exe'], name: 'Paladins' },
  { processes: ['halo', 'haloinfinite', 'haloinfinite.exe'], name: 'Halo Infinite' },
  { processes: ['tf2', 'hl2.exe'], name: 'Team Fortress 2' },
  { processes: ['arma3', 'arma3.exe', 'arma3_x64.exe'], name: 'Arma 3' },
  { processes: ['arma reforger', 'armareforger.exe'], name: 'Arma Reforger' },
  { processes: ['squad', 'squad.exe', 'squad-win64-shipping'], name: 'Squad' },
  { processes: ['insurgency', 'insurgencysandstorm', 'insurgencysandstorm.exe'], name: 'Insurgency: Sandstorm' },
  { processes: ['hunt', 'huntshowdown', 'huntgame'], name: 'Hunt: Showdown' },

  // ── MOBA ──
  { processes: ['leagueoflegends', 'league of legends', 'leagueclient', 'leagueclient.exe', 'league of legends.exe'], name: 'League of Legends' },
  { processes: ['dota2', 'dota2.exe'], name: 'Dota 2' },
  { processes: ['smite', 'smite.exe', 'smite2'], name: 'SMITE 2' },
  { processes: ['hots', 'heroesofthestorm', 'heroesofthestorm_x64.exe'], name: 'Heroes of the Storm' },
  { processes: ['pokemonunite', 'pokemon-unite'], name: 'Pokémon UNITE' },

  // ── Sandbox / Survival ──
  { processes: ['minecraft', 'javaw', 'minecraft.exe', 'minecraftlauncher'], name: 'Minecraft' },
  { processes: ['terraria', 'terraria.exe'], name: 'Terraria' },
  { processes: ['rust', 'rustclient', 'rustclient.exe'], name: 'Rust' },
  { processes: ['ark', 'arkascended', 'shootergame', 'shootergame.exe'], name: 'ARK: Survival Ascended' },
  { processes: ['valheim', 'valheim.exe'], name: 'Valheim' },
  { processes: ['palworld', 'palworld-win64-shipping', 'palworld.exe'], name: 'Palworld' },
  { processes: ['subnautica', 'subnautica.exe'], name: 'Subnautica' },
  { processes: ['satisfactory', 'satisfactory.exe', 'factorygame-win64-shipping'], name: 'Satisfactory' },
  { processes: ['astroneer', 'astro-win64-shipping'], name: 'Astroneer' },
  { processes: ['raft', 'raft.exe'], name: 'Raft' },
  { processes: ['grounded', 'grounded.exe', 'maine-win64-shipping'], name: 'Grounded' },
  { processes: ['theforest', 'theforest.exe'], name: 'The Forest' },
  { processes: ['sonsoftheforest', 'sonsoftheforest.exe'], name: 'Sons of the Forest' },
  { processes: ['7daystodie', '7daystodie.exe'], name: '7 Days to Die' },
  { processes: ['nomansskygame', 'nms.exe'], name: "No Man's Sky" },
  { processes: ['projectzomboid', 'projectzomboid.exe'], name: 'Project Zomboid' },
  { processes: ['conanexiles', 'conansandbox', 'conansandbox.exe'], name: 'Conan Exiles' },
  { processes: ['dayz', 'dayz_x64', 'dayz.exe'], name: 'DayZ' },
  { processes: ['starbound', 'starbound.exe'], name: 'Starbound' },
  { processes: ['unturned', 'unturned.exe'], name: 'Unturned' },
  { processes: ['icarus', 'icarus-win64-shipping.exe'], name: 'Icarus' },
  { processes: ['theisle', 'theisle.exe'], name: 'The Isle' },
  { processes: ['greenhell', 'greenhell.exe'], name: 'Green Hell' },
  { processes: ['longdark', 'tld.exe'], name: 'The Long Dark' },
  { processes: ['enshrouded', 'enshrouded.exe'], name: 'Enshrouded' },
  { processes: ['craftopia', 'craftopia.exe'], name: 'Craftopia' },

  // ── RPG / Action RPG ──
  { processes: ['eldenring', 'eldenring.exe'], name: 'Elden Ring' },
  { processes: ['cyberpunk2077', 'cyberpunk2077.exe'], name: 'Cyberpunk 2077' },
  { processes: ['baldursgate3', 'bg3', 'bg3.exe', 'bg3_dx11.exe'], name: "Baldur's Gate 3" },
  { processes: ['hogwartslegacy', 'hogwartslegacy.exe'], name: 'Hogwarts Legacy' },
  { processes: ['witcher3', 'witcher3.exe'], name: 'The Witcher 3' },
  { processes: ['skyrim', 'skyrimse', 'skyrimse.exe'], name: 'The Elder Scrolls V: Skyrim' },
  { processes: ['fallout4', 'fallout4.exe'], name: 'Fallout 4' },
  { processes: ['fallout76', 'fallout76.exe'], name: 'Fallout 76' },
  { processes: ['starfield', 'starfield.exe'], name: 'Starfield' },
  { processes: ['diablo4', 'diablo iv', 'diablo iv.exe'], name: 'Diablo IV' },
  { processes: ['pathofexile', 'pathofexile_x64', 'pathofexile.exe'], name: 'Path of Exile' },
  { processes: ['pathofexile2', 'pathofexile2.exe'], name: 'Path of Exile 2' },
  { processes: ['lostark', 'lostark.exe'], name: 'Lost Ark' },
  { processes: ['darksouls3', 'darksoulsiii.exe'], name: 'Dark Souls III' },
  { processes: ['monsterhunterworld', 'monsterhunterworld.exe'], name: 'Monster Hunter: World' },
  { processes: ['monsterhunterrise', 'monsterhunterrise.exe'], name: 'Monster Hunter Rise' },
  { processes: ['monsterhunterwilds', 'monsterhunterwilds.exe'], name: 'Monster Hunter Wilds' },
  { processes: ['dragonsdogma2', 'dd2.exe'], name: "Dragon's Dogma 2" },
  { processes: ['persona5royal', 'p5r.exe'], name: 'Persona 5 Royal' },
  { processes: ['persona3reload', 'p3r.exe'], name: 'Persona 3 Reload' },
  { processes: ['finalfantasyxiv', 'ffxiv', 'ffxiv_dx11', 'ffxiv_dx11.exe'], name: 'Final Fantasy XIV' },
  { processes: ['finalfantasyxvi', 'ffxvi', 'ffxvi.exe'], name: 'Final Fantasy XVI' },
  { processes: ['finalfantasyvii', 'ff7remake', 'ff7remake.exe', 'ff7rebirth', 'ffvii_rebirth.exe'], name: 'Final Fantasy VII Rebirth' },
  { processes: ['genshinimpact', 'genshinimpact.exe', 'yuanshen.exe'], name: 'Genshin Impact' },
  { processes: ['honkaistarrail', 'starrail', 'starrail.exe'], name: 'Honkai: Star Rail' },
  { processes: ['zenlesszonezero', 'zenlesszonezero.exe', 'zzz.exe'], name: 'Zenless Zone Zero' },
  { processes: ['wutheringwaves', 'wutheringwaves.exe', 'client-win64-shipping'], name: 'Wuthering Waves' },
  { processes: ['toweroffantasy', 'toweroffantasy.exe'], name: 'Tower of Fantasy' },
  { processes: ['godofwar', 'godofwar.exe', 'godofwarragnarok.exe'], name: 'God of War Ragnarök' },
  { processes: ['ghostoftsushima', 'ghostoftsushima.exe'], name: 'Ghost of Tsushima' },
  { processes: ['horizonforbiddenwest', 'horizonforbiddenwest.exe'], name: 'Horizon Forbidden West' },
  { processes: ['sekiro', 'sekiro.exe'], name: 'Sekiro: Shadows Die Twice' },
  { processes: ['nierautomata', 'nierautomata.exe'], name: 'NieR:Automata' },
  { processes: ['kingdomhearts3', 'kingdom hearts iii.exe'], name: 'Kingdom Hearts III' },
  { processes: ['dragonage', 'dragonagetheveilguard.exe'], name: 'Dragon Age: The Veilguard' },
  { processes: ['avowed', 'avowed.exe', 'avowed-win64-shipping'], name: 'Avowed' },
  { processes: ['likeadragon', 'likeadragon.exe', 'yakuza'], name: 'Like a Dragon' },

  // ── MMO ──
  { processes: ['wow', 'wow.exe', 'wowclassic', 'wowclassic.exe'], name: 'World of Warcraft' },
  { processes: ['gw2', 'gw2-64', 'gw2-64.exe'], name: 'Guild Wars 2' },
  { processes: ['newworld', 'newworld.exe'], name: 'New World' },
  { processes: ['eso', 'eso64', 'eso.exe'], name: 'The Elder Scrolls Online' },
  { processes: ['runelite', 'osrs', 'jagexlauncher'], name: 'Old School RuneScape' },
  { processes: ['albion', 'albion-online'], name: 'Albion Online' },
  { processes: ['blackdesert', 'blackdesert64.exe'], name: 'Black Desert Online' },
  { processes: ['warcraft', 'wowt', 'wowb'], name: 'World of Warcraft' },
  { processes: ['throneandliberty', 'tl.exe'], name: 'Throne and Liberty' },

  // ── Strategy / City Builder ──
  { processes: ['civilization', 'civ6', 'civ7', 'civilizationvi', 'civilizationvii'], name: 'Civilization' },
  { processes: ['aoe2', 'aoe2de_s', 'aoe4', 'ageofempires'], name: 'Age of Empires' },
  { processes: ['totalwar', 'warhammer3', 'warhammer2'], name: 'Total War: Warhammer' },
  { processes: ['stellaris', 'stellaris.exe'], name: 'Stellaris' },
  { processes: ['crusaderkings3', 'ck3.exe'], name: 'Crusader Kings III' },
  { processes: ['eu4', 'eu4.exe'], name: 'Europa Universalis IV' },
  { processes: ['hearts of iron iv', 'hoi4.exe'], name: 'Hearts of Iron IV' },
  { processes: ['citiesskylines2', 'cities2', 'cities.exe', 'cities2.exe'], name: 'Cities: Skylines II' },
  { processes: ['factorio', 'factorio.exe'], name: 'Factorio' },
  { processes: ['rimworld', 'rimworldwin', 'rimworld.exe'], name: 'RimWorld' },
  { processes: ['starcraft2', 'sc2', 'sc2_x64.exe'], name: 'StarCraft II' },
  { processes: ['manor lords', 'manorlords.exe', 'manorlords-win64-shipping'], name: 'Manor Lords' },
  { processes: ['frostpunk2', 'frostpunk2.exe', 'frostpunk'], name: 'Frostpunk 2' },
  { processes: ['northgard', 'northgard.exe'], name: 'Northgard' },
  { processes: ['planetzoo', 'planetzoo.exe'], name: 'Planet Zoo' },
  { processes: ['planetcoaster', 'planetcoaster2.exe'], name: 'Planet Coaster 2' },
  { processes: ['spacemarine2', 'spacemarine2.exe', 'spacemarine2-win64-shipping'], name: 'Warhammer 40K: Space Marine 2' },

  // ── Sports / Racing ──
  { processes: ['rocketleague', 'rocketleague.exe'], name: 'Rocket League' },
  { processes: ['fifa', 'fc25', 'fc24', 'eafc', 'fc25.exe'], name: 'EA SPORTS FC' },
  { processes: ['nba2k', 'nba2k25', 'nba2k24'], name: 'NBA 2K' },
  { processes: ['madden', 'madden25', 'madden24'], name: 'Madden NFL' },
  { processes: ['forzahorizon5', 'forzahorizon4', 'forzahorizon5.exe'], name: 'Forza Horizon 5' },
  { processes: ['forzamotorsport', 'forzamotorsport.exe'], name: 'Forza Motorsport' },
  { processes: ['granturismo', 'granturismo7'], name: 'Gran Turismo 7' },
  { processes: ['assettocorsa', 'acs.exe', 'acc.exe'], name: 'Assetto Corsa' },
  { processes: ['iracing', 'iracingsim64dx11.exe'], name: 'iRacing' },

  // ── Horror / Survival Horror ──
  { processes: ['phasmophobia', 'phasmophobia.exe'], name: 'Phasmophobia' },
  { processes: ['lethalcompany', 'lethal company.exe'], name: 'Lethal Company' },
  { processes: ['deadbydaylight', 'deadbydaylight-win64-shipping.exe'], name: 'Dead by Daylight' },
  { processes: ['residentevil4', 're4', 're4.exe'], name: 'Resident Evil 4' },
  { processes: ['residentevil2', 're2', 're2.exe'], name: 'Resident Evil 2' },
  { processes: ['outlast', 'outlasttrials', 'theoutlasttrials.exe'], name: 'The Outlast Trials' },
  { processes: ['devour', 'devour.exe'], name: 'DEVOUR' },
  { processes: ['contentwarning', 'content warning.exe'], name: 'Content Warning' },
  { processes: ['alien isolation', 'ai.exe'], name: 'Alien: Isolation' },
  { processes: ['silenthill2', 'sh2r-win64-shipping'], name: 'Silent Hill 2' },

  // ── Battle Arena / Card / Auto-Battler ──
  { processes: ['hearthstone', 'hearthstone.exe'], name: 'Hearthstone' },
  { processes: ['teamfighttactics', 'tft'], name: 'Teamfight Tactics' },
  { processes: ['mtga', 'mtga.exe'], name: 'Magic: The Gathering Arena' },
  { processes: ['yugioh', 'masterduel', 'masterduel.exe'], name: 'Yu-Gi-Oh! Master Duel' },
  { processes: ['marvelsnap', 'snap.exe'], name: 'Marvel Snap' },

  // ── Simulation / Management ──
  { processes: ['thesims4', 'ts4_x64', 'ts4_x64.exe'], name: 'The Sims 4' },
  { processes: ['msfs', 'flightsimulator', 'flightsimulator.exe', 'flightsimulator2024'], name: 'Microsoft Flight Simulator' },
  { processes: ['euro truck simulator 2', 'eurotrucks2.exe'], name: 'Euro Truck Simulator 2' },
  { processes: ['farmingsimulator', 'farmingsimulator2022.exe', 'farmingsimulator2025.exe'], name: 'Farming Simulator' },
  { processes: ['stardewvalley', 'stardew valley', 'stardew valley.exe'], name: 'Stardew Valley' },
  { processes: ['animalcrossing', 'yuzu'], name: 'Animal Crossing' },
  { processes: ['powerwashsimulator', 'powerwashsimulator.exe'], name: 'PowerWash Simulator' },

  // ── Platformer / Indie ──
  { processes: ['hollowknight', 'hollow_knight', 'hollow_knight.exe'], name: 'Hollow Knight' },
  { processes: ['hollowknightsilksong', 'silksong'], name: 'Hollow Knight: Silksong' },
  { processes: ['celeste', 'celeste.exe'], name: 'Celeste' },
  { processes: ['hades', 'hades.exe', 'hades2', 'hades ii'], name: 'Hades II' },
  { processes: ['deadcells', 'deadcells.exe'], name: 'Dead Cells' },
  { processes: ['cuphead', 'cuphead.exe'], name: 'Cuphead' },
  { processes: ['orithewillofthewisps', 'oriwotw.exe'], name: 'Ori and the Will of the Wisps' },
  { processes: ['shovelknight', 'shovelknight.exe'], name: 'Shovel Knight' },

  // ── Multiplayer / Social / Party ──
  { processes: ['amongus', 'among us', 'among us.exe'], name: 'Among Us' },
  { processes: ['fallguys', 'fallguys_client', 'fallguys_client_game.exe'], name: 'Fall Guys' },
  { processes: ['multiversus', 'multiversus.exe', 'multiversus-win64-shipping'], name: 'MultiVersus' },
  { processes: ['garticphone', 'gartic'], name: 'Gartic Phone' },
  { processes: ['humanfallflat', 'human.exe'], name: 'Human: Fall Flat' },
  { processes: ['gangbeasts', 'gang beasts.exe'], name: 'Gang Beasts' },
  { processes: ['supersmashbros', 'ssbu'], name: 'Super Smash Bros.' },
  { processes: ['marvelrivals', 'marvelrivals.exe', 'marvelrivals-win64-shipping'], name: 'Marvel Rivals' },

  // ── Fighting ──
  { processes: ['streetfighter6', 'streetfighter6.exe', 'sf6'], name: 'Street Fighter 6' },
  { processes: ['tekken8', 'tekken8.exe'], name: 'Tekken 8' },
  { processes: ['mortalkombat1', 'mk1.exe', 'mortalkombat'], name: 'Mortal Kombat 1' },
  { processes: ['dragonballfighterz', 'dbfz', 'dbfz.exe'], name: 'Dragon Ball FighterZ' },
  { processes: ['sparkingzero', 'sparkingzero.exe'], name: 'Dragon Ball: Sparking! ZERO' },
  { processes: ['granblue', 'gbvsr', 'gbvsr.exe'], name: 'Granblue Fantasy Versus: Rising' },
  { processes: ['guiltygearstrive', 'ggst', 'ggst.exe'], name: 'Guilty Gear -Strive-' },

  // ── Open World / Adventure ──
  { processes: ['gtav', 'gta5', 'gta5.exe', 'playgtav.exe'], name: 'Grand Theft Auto V' },
  { processes: ['gta6'], name: 'Grand Theft Auto VI' },
  { processes: ['rdr2', 'rdr2.exe'], name: 'Red Dead Redemption 2' },
  { processes: ['spidermanremastered', 'spiderman.exe', 'spiderman2.exe'], name: "Marvel's Spider-Man" },
  { processes: ['zelda', 'totk', 'botw'], name: 'The Legend of Zelda' },
  { processes: ['assassinscreed', 'acmirage', 'acodyssey', 'acvalhalla', 'acshadows'], name: "Assassin's Creed" },
  { processes: ['dyinglight2', 'dyinglight2.exe'], name: 'Dying Light 2' },
  { processes: ['alanwake2', 'alanwake2.exe'], name: 'Alan Wake 2' },
  { processes: ['deathstranding', 'ds.exe'], name: 'Death Stranding' },
  { processes: ['thelastofus', 'tlou-i', 'tlou-i.exe'], name: 'The Last of Us Part I' },
  { processes: ['control', 'control_dx12.exe'], name: 'Control' },
  { processes: ['daysgone', 'daysgone.exe', 'bendgame-win64-shipping'], name: 'Days Gone' },

  // ── Co-op / Multiplayer Survival ──
  { processes: ['deeprockgalactic', 'fsd-win64-shipping.exe', 'deeprockgalactic2'], name: 'Deep Rock Galactic' },
  { processes: ['left4dead2', 'left4dead2.exe'], name: 'Left 4 Dead 2' },
  { processes: ['backfourbload', 'back4blood', 'b4b-win64-shipping.exe'], name: 'Back 4 Blood' },
  { processes: ['seaofthieves', 'seaofthieves.exe'], name: 'Sea of Thieves' },
  { processes: ['gtfo', 'gtfo.exe'], name: 'GTFO' },
  { processes: ['readyornot', 'readyornot-win64-shipping.exe'], name: 'Ready or Not' },
  { processes: ['payday3', 'payday3-win64-shipping.exe', 'payday2'], name: 'PAYDAY 3' },

  // ── Roguelike / Roguelite ──
  { processes: ['slaythespire', 'slaythespire.exe', 'slaythespire2.exe'], name: 'Slay the Spire' },
  { processes: ['enterthegungeon', 'etg.exe'], name: 'Enter the Gungeon' },
  { processes: ['riskofrain2', 'risk of rain 2.exe'], name: 'Risk of Rain 2' },
  { processes: ['binding of isaac', 'isaacng.exe', 'isaac-ng.exe'], name: 'The Binding of Isaac' },
  { processes: ['inscryption', 'inscryption.exe'], name: 'Inscryption' },
  { processes: ['vampire survivors', 'vampiresurvivors.exe'], name: 'Vampire Survivors' },
  { processes: ['balatro', 'balatro.exe'], name: 'Balatro' },

  // ── Sandbox / Creative ──
  { processes: ['roblox', 'robloxplayerbeta', 'robloxplayerbeta.exe'], name: 'Roblox' },
  { processes: ['garrymod', 'gmod', 'gmod.exe'], name: "Garry's Mod" },
  { processes: ['spaceengineers', 'spaceengineers.exe'], name: 'Space Engineers' },
  { processes: ['vrising', 'vrising.exe'], name: 'V Rising' },
  { processes: ['corekeeper', 'corekeeper.exe'], name: 'Core Keeper' },

  // ── VR ──
  { processes: ['beatsaber', 'beat saber.exe'], name: 'Beat Saber' },
  { processes: ['vrchat', 'vrchat.exe'], name: 'VRChat' },
  { processes: ['pavlov', 'pavlov.exe'], name: 'Pavlov VR' },
  { processes: ['boneworks', 'boneworks.exe', 'bonelab'], name: 'BONELAB' },
  { processes: ['halflifealyx', 'hlvr', 'hlvr.exe'], name: 'Half-Life: Alyx' },

  // ── Turn-Based / Tactics ──
  { processes: ['xcom2', 'xcom2.exe'], name: 'XCOM 2' },
  { processes: ['intothebreach', 'intothebreach.exe'], name: 'Into the Breach' },
  { processes: ['fireemblem', 'fireemblemthreehouses'], name: 'Fire Emblem' },

  // ── Puzzle / Narrative ──
  { processes: ['portal2', 'portal2.exe'], name: 'Portal 2' },
  { processes: ['itttakesthree', 'ittakestwo', 'nuts.exe'], name: 'It Takes Two' },
  { processes: ['ashortthike', 'a short hike.exe'], name: 'A Short Hike' },
  { processes: ['whatremainsofedithfinch'], name: 'What Remains of Edith Finch' },
  { processes: ['thewitness', 'thewitness.exe'], name: 'The Witness' },
  { processes: ['detroitbecomehuman', 'detroitbecomehuman.exe'], name: 'Detroit: Become Human' },

  // ── Music / Rhythm ──
  { processes: ['osu', 'osu!', 'osu!.exe'], name: 'osu!' },
  { processes: ['geometry dash', 'geometrydash.exe'], name: 'Geometry Dash' },
  { processes: ['fnf', 'funkin', 'funkin.exe'], name: "Friday Night Funkin'" },

  // ── Extraction / Looter ──
  { processes: ['arcraiders', 'arc raiders', 'arcraiders.exe', 'arc raiders.exe', 'arcraiders-win64-shipping', 'arcraiders-win64-shipping.exe'], name: 'ARC Raiders' },
  { processes: ['thedivision2', 'thedivision2.exe'], name: 'The Division 2' },
  { processes: ['marauders', 'marauders.exe'], name: 'Marauders' },

  // ── Space / Sci-Fi ──
  { processes: ['elitedangerous', 'elitedangerous64.exe'], name: 'Elite Dangerous' },
  { processes: ['eveonline', 'exefile', 'exefile.exe'], name: 'EVE Online' },
  { processes: ['starcitizen', 'starcitizen.exe'], name: 'Star Citizen' },
  { processes: ['kerbalspaceprogram', 'ksp.exe', 'ksp2.exe'], name: 'Kerbal Space Program' },

  // ── War / Military Sim ──
  { processes: ['warthunder', 'aces.exe'], name: 'War Thunder' },
  { processes: ['worldoftanks', 'worldoftanks.exe'], name: 'World of Tanks' },
  { processes: ['worldofwarships', 'worldofwarships.exe', 'worldofwarships64.exe'], name: 'World of Warships' },
  { processes: ['dcs', 'dcs.exe'], name: 'DCS World' },
  { processes: ['thehunter', 'thehuntercotw.exe'], name: 'theHunter: Call of the Wild' },

  // ── Misc Popular ──
  { processes: ['chess', 'lichess', 'chess.com'], name: 'Chess' },
  { processes: ['geoguessr'], name: 'GeoGuessr' },
  { processes: ['idleslayer', 'idle slayer'], name: 'Idle Slayer' },
  { processes: ['scopegame', 'scope.exe'], name: 'Scope' },

  // ── Streaming / Content Apps (shown as activity) ──
  { processes: ['obs64', 'obs32', 'obs64.exe', 'obs32.exe', 'obs'], name: 'OBS Studio', type: 'streaming' },
  { processes: ['streamlabs obs', 'streamlabs'], name: 'Streamlabs', type: 'streaming' },
  { processes: ['spotify', 'spotify.exe'], name: 'Spotify', type: 'listening' },
];

// ── Process name → game entry lookup map ────────────────────
const processLookup = new Map();
for (const game of GAME_DATABASE) {
  for (const proc of game.processes) {
    processLookup.set(proc.toLowerCase(), game);
  }
}

// ── Processes to always ignore (never games) ────────────────
const IGNORED_PROCESSES = new Set([
  'explorer.exe', 'svchost.exe', 'system', 'idle', 'csrss.exe',
  'dwm.exe', 'taskhostw.exe', 'sihost.exe', 'ctfmon.exe', 'conhost.exe',
  'searchhost.exe', 'runtimebroker.exe', 'applicationframehost.exe',
  'systemsettings.exe', 'textinputhost.exe', 'shellexperiencehost.exe',
  'startmenuexperiencehost.exe', 'lockapp.exe', 'securityhealthsystray.exe',
  'notepad.exe', 'calculator.exe', 'mspaint.exe', 'snippingtool.exe',
  'recoilapp.exe', 'electron.exe', 'discord.exe',
  'chrome.exe', 'firefox.exe', 'msedge.exe', 'opera.exe', 'brave.exe',
  'code.exe', 'devenv.exe', 'rider64.exe',
  'taskmgr.exe', 'perfmon.exe', 'mmc.exe', 'cmd.exe', 'powershell.exe',
  'windowsterminal.exe', 'wt.exe', 'winstore.app.exe',
  'steam.exe', 'steamwebhelper.exe', 'steamservice.exe', 'gameoverlayui.exe',
  'epicgameslauncher.exe', 'unrealcefsubprocess.exe',
  'gog galaxy.exe', 'galaxyclient.exe',
  'origin.exe', 'ea desktop.exe', 'eadesktop.exe', 'eabackgroundservice.exe',
  'battle.net.exe', 'agent.exe',
  'ubisoftconnect.exe', 'upc.exe',
  'nvidia share.exe', 'nvcontainer.exe', 'nvoawrappercache.exe',
  'razer synapse 3.exe', 'razercentralservice.exe',
  'corsair.service.cpuidplugin.exe', 'icue.exe',
  'wallpaper32.exe', 'wallpaper64.exe',
  'steamvr.exe', 'vrserver.exe', 'vrmonitor.exe',
  'crashhandler.exe', 'crashhandler64.exe',
  'steamwebhelper', 'gameoverlayui',
  'nvidia share', 'nvcontainer',
]);

// ── Window title keywords that suggest NOT a game ───────────
const NON_GAME_TITLE_KEYWORDS = [
  'settings', 'preferences', 'task manager', 'file explorer',
  'control panel', 'command prompt', 'powershell', 'terminal',
  'visual studio', 'vs code', 'notepad', 'calculator',
  'microsoft store', 'mail', 'calendar', 'photos', 'movies',
  'recoilapp', 'discord', 'slack', 'teams', 'chrome',
  'firefox', 'edge', 'opera', 'brave', 'explorer',
];

// ── Steam Library Scanner ───────────────────────────────────

let steamGamesCache = null;
let steamGamesCacheTime = 0;
const STEAM_CACHE_TTL = 5 * 60 * 1000; // Re-scan every 5 minutes

function getSteamInstallPath() {
  const platform = os.platform();
  if (platform === 'win32') {
    const paths = [
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Steam'),
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'D:\\SteamLibrary',
      'E:\\Steam',
      'E:\\SteamLibrary',
    ];
    for (const p of paths) {
      try {
        if (fs.existsSync(path.join(p, 'steam.exe')) || fs.existsSync(path.join(p, 'Steam.exe'))) {
          return p;
        }
      } catch (e) { /* ignore */ }
    }
  } else if (platform === 'linux') {
    const home = os.homedir();
    const paths = [
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam'),
    ];
    for (const p of paths) {
      try { if (fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
    }
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Steam');
  }
  return null;
}

function getSteamLibraryFolders(steamPath) {
  const folders = [steamPath];
  try {
    // Try both possible VDF locations
    const vdfPaths = [
      path.join(steamPath, 'steamapps', 'libraryfolders.vdf'),
      path.join(steamPath, 'config', 'libraryfolders.vdf'),
    ];
    for (const vdfPath of vdfPaths) {
      if (!fs.existsSync(vdfPath)) continue;
      const content = fs.readFileSync(vdfPath, 'utf-8');
      const pathMatches = content.match(/"path"\s+"([^"]+)"/g);
      if (pathMatches) {
        for (const m of pathMatches) {
          const p = m.match(/"path"\s+"([^"]+)"/)[1].replace(/\\\\/g, '\\');
          if (!folders.includes(p)) folders.push(p);
        }
      }
      break; // Only need one
    }
  } catch (err) { /* ignore */ }
  return folders;
}

function scanSteamGames() {
  if (steamGamesCache && Date.now() - steamGamesCacheTime < STEAM_CACHE_TTL) {
    return steamGamesCache;
  }

  const games = new Map(); // installDir (lowercase) → game name
  const steamPath = getSteamInstallPath();
  if (!steamPath) {
    steamGamesCache = games;
    steamGamesCacheTime = Date.now();
    return games;
  }

  const libraryFolders = getSteamLibraryFolders(steamPath);

  for (const folder of libraryFolders) {
    const appsDir = path.join(folder, 'steamapps');
    if (!fs.existsSync(appsDir)) continue;

    try {
      const files = fs.readdirSync(appsDir);
      for (const file of files) {
        if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue;
        try {
          const content = fs.readFileSync(path.join(appsDir, file), 'utf-8');
          const nameMatch = content.match(/"name"\s+"([^"]+)"/);
          const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/);

          if (nameMatch && installDirMatch) {
            const name = nameMatch[1];
            const installDir = installDirMatch[1].toLowerCase();

            // Skip tools/redistributables
            if (name.toLowerCase().includes('redistribut') ||
                name.toLowerCase().includes('proton') ||
                name.toLowerCase().includes('steamworks') ||
                name.toLowerCase().includes('steam linux runtime') ||
                name.toLowerCase().includes('directx')) continue;

            games.set(installDir, name);
          }
        } catch (err) { /* skip */ }
      }
    } catch (err) { /* skip */ }
  }

  steamGamesCache = games;
  steamGamesCacheTime = Date.now();
  console.log('[GameDetector] Scanned', games.size, 'Steam games');
  return games;
}

// ── Process Scanning ────────────────────────────────────────

// Reusable containers to reduce GC pressure from 10s polling
const _sharedProcesses = new Set();
const _sharedWindowTitles = new Map();

/**
 * Parse a single line of CSV, handling quoted fields.
 */
function parseCSVLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Get running processes with window titles.
 * Returns { processes: Set<string>, windowTitles: Map<string, string> }
 */
function getRunningProcesses() {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    let cmd;

    if (platform === 'win32') {
      // /V includes window titles — essential for game detection
      cmd = 'tasklist /V /FO CSV /NH';
    } else if (platform === 'darwin') {
      cmd = 'ps -eo comm=';
    } else {
      cmd = 'ps -eo comm=';
    }

    exec(cmd, { maxBuffer: 512 * 1024, timeout: 10000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      // Reuse shared objects to avoid GC pressure from frequent polling
      _sharedProcesses.clear();
      _sharedWindowTitles.clear();
      const processes = _sharedProcesses;
      const windowTitles = _sharedWindowTitles;

      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        let name;
        let title = '';

        if (platform === 'win32') {
          // CSV: "Name","PID","Session","Session#","Mem","Status","User","CPU Time","Window Title"
          const parts = parseCSVLine(line);
          if (parts.length >= 1) {
            name = parts[0].toLowerCase();
            title = parts.length >= 9 ? parts[8] : '';
          }
        } else {
          name = line.trim().toLowerCase();
          if (name.includes('/')) name = name.split('/').pop();
        }

        if (name) {
          processes.add(name);
          if (name.endsWith('.exe')) {
            processes.add(name.slice(0, -4));
          }
          // Store non-empty window titles
          if (title && title !== 'N/A' && title.trim().length > 1) {
            windowTitles.set(name, title.trim());
          }
        }
      }

      resolve({ processes, windowTitles });
    });
  });
}

// ── Detection Engine ────────────────────────────────────────

/**
 * Detect running games using layered strategies:
 *  1. Direct process name match against curated DB
 *  2. Window title match against curated DB game names
 *  3. Steam library match — window title or process matches installed Steam game
 *  4. Unreal/Unity engine heuristic — processes with -Win64-Shipping pattern
 */
async function detectGame() {
  try {
    const { processes, windowTitles } = await getRunningProcesses();

    // ── Strategy 1: Direct process name match (highest priority) ──
    for (const game of GAME_DATABASE) {
      for (const proc of game.processes) {
        if (processes.has(proc.toLowerCase())) {
          return {
            name: game.name,
            type: game.type || 'playing',
            process: proc,
            source: 'process_db',
          };
        }
      }
    }

    // ── Strategy 2: Window title contains a known game name ──
    for (const [procName, title] of windowTitles) {
      if (IGNORED_PROCESSES.has(procName)) continue;
      const titleLower = title.toLowerCase();
      if (NON_GAME_TITLE_KEYWORDS.some(kw => titleLower.includes(kw))) continue;

      for (const game of GAME_DATABASE) {
        const nameLower = game.name.toLowerCase();
        if (titleLower === nameLower || titleLower.startsWith(nameLower) || titleLower.includes(nameLower)) {
          return {
            name: game.name,
            type: game.type || 'playing',
            process: procName,
            source: 'window_title_db',
          };
        }
      }
    }

    // ── Strategy 3: Steam library — match window titles or process against installed games ──
    const steamGames = scanSteamGames();
    if (steamGames.size > 0) {
      // 3a: Check if any window title matches a Steam game name
      for (const [procName, title] of windowTitles) {
        if (IGNORED_PROCESSES.has(procName)) continue;
        const titleLower = title.toLowerCase();
        if (NON_GAME_TITLE_KEYWORDS.some(kw => titleLower.includes(kw))) continue;
        if (titleLower.length < 2) continue;

        for (const [installDir, gameName] of steamGames) {
          const nameL = gameName.toLowerCase();
          if (titleLower.includes(nameL) || nameL.includes(titleLower)) {
            return {
              name: gameName,
              type: 'playing',
              process: procName,
              source: 'steam_title',
            };
          }
        }
      }

      // 3b: Check if process name matches a Steam install directory
      for (const [procName] of windowTitles) {
        if (IGNORED_PROCESSES.has(procName)) continue;
        const procBase = procName.replace('.exe', '').replace(/-win64-shipping/i, '').replace(/-shipping/i, '');
        if (procBase.length < 4) continue;

        for (const [installDir, gameName] of steamGames) {
          if (installDir.includes(procBase) || procBase.includes(installDir)) {
            return {
              name: gameName,
              type: 'playing',
              process: procName,
              source: 'steam_dir',
            };
          }
        }
      }
    }

    // ── Strategy 4: Unreal Engine / Unity heuristic ──
    // Anything named *-Win64-Shipping.exe is likely an Unreal Engine game.
    // Use the window title as the display name.
    for (const [procName, title] of windowTitles) {
      if (IGNORED_PROCESSES.has(procName)) continue;
      const titleLower = title.toLowerCase();
      if (NON_GAME_TITLE_KEYWORDS.some(kw => titleLower.includes(kw))) continue;

      const isUnrealGame = procName.includes('-win64-shipping') || procName.includes('-shipping');
      const isUnityGame = procName.includes('unity') && !procName.includes('unityhub') && !procName.includes('unitycrash');

      if ((isUnrealGame || isUnityGame) && title.length > 1 && title.length < 80) {
        return {
          name: title,
          type: 'playing',
          process: procName,
          source: 'engine_heuristic',
        };
      }
    }

    return null;
  } catch (err) {
    console.error('[GameDetector] Detection failed:', err.message);
    return null;
  }
}

// ── GameDetector Class ──────────────────────────────────────

class GameDetector {
  constructor() {
    this.interval = null;
    this.currentGame = null;
    this.onGameDetected = null;
    this.onGameExited = null;
    this.pollIntervalMs = 10000; // 10 seconds
    this.enabled = true;

    // Pre-warm Steam library cache
    try { scanSteamGames(); } catch (e) { /* ignore */ }
  }

  start(onDetected, onExited) {
    this.onGameDetected = onDetected;
    this.onGameExited = onExited;
    this.poll();
    this.interval = setInterval(() => this.poll(), this.pollIntervalMs);
    console.log('[GameDetector] Started polling every', this.pollIntervalMs / 1000, 'seconds');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.currentGame = null;
    console.log('[GameDetector] Stopped');
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.currentGame) {
      this.currentGame = null;
      if (this.onGameExited) this.onGameExited();
    }
  }

  async poll() {
    if (!this.enabled) return;

    try {
      const game = await detectGame();

      if (game && (!this.currentGame || this.currentGame.name !== game.name)) {
        this.currentGame = game;
        console.log('[GameDetector] Detected:', game.name, '(via', game.source + ', process:', game.process + ')');
        if (this.onGameDetected) this.onGameDetected(game);
      } else if (!game && this.currentGame) {
        console.log('[GameDetector] Game exited:', this.currentGame.name);
        this.currentGame = null;
        if (this.onGameExited) this.onGameExited();
      }
    } catch (err) {
      console.error('[GameDetector] Poll error:', err.message);
    }
  }

  getGameList() {
    const names = new Set();
    for (const game of GAME_DATABASE) {
      if (!game.type || game.type === 'playing') names.add(game.name);
    }
    try {
      const steamGames = scanSteamGames();
      for (const [, name] of steamGames) names.add(name);
    } catch (e) { /* ignore */ }
    return [...names].sort();
  }

  getCurrentGame() {
    return this.currentGame;
  }
}

module.exports = { GameDetector, GAME_DATABASE };
