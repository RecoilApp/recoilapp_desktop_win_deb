/**
 * Game Detection Module for RecoilApp Desktop
 *
 * Periodically scans running processes against a curated list
 * of the top 200 most popular games. When a match is found,
 * fires a callback with the game info. When the game exits,
 * fires a clear callback.
 */
const { exec } = require('child_process');
const os = require('os');

// ── Top 200 Games Database ──────────────────────────────────
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

  // ── RPG / Action RPG ──
  { processes: ['eldenring', 'eldenring.exe', 'start_protected_game.exe'], name: 'Elden Ring' },
  { processes: ['cyberpunk2077', 'cyberpunk2077.exe'], name: 'Cyberpunk 2077' },
  { processes: ['baldursgate3', 'bg3', 'bg3.exe', 'bg3_dx11.exe'], name: "Baldur's Gate 3" },
  { processes: ['hogwartslegacy', 'hogwartslegacy.exe'], name: 'Hogwarts Legacy' },
  { processes: ['witcher3', 'witcher3.exe'], name: 'The Witcher 3' },
  { processes: ['skyrim', 'skyrimse', 'skyrimse.exe'], name: 'The Elder Scrolls V: Skyrim' },
  { processes: ['fallout4', 'fallout4.exe'], name: 'Fallout 4' },
  { processes: ['fallout76', 'fallout76.exe'], name: 'Fallout 76' },
  { processes: ['starfield', 'starfield.exe'], name: 'Starfield' },
  { processes: ['diablo4', 'diablo iv', 'diablo iv.exe'], name: 'Diablo IV' },
  { processes: ['pathofexile', 'pathofexile', 'pathofexile_x64', 'pathofexile.exe'], name: 'Path of Exile' },
  { processes: ['pathofexile2', 'pathofexile2.exe'], name: 'Path of Exile 2' },
  { processes: ['lostark', 'lostark.exe'], name: 'Lost Ark' },
  { processes: ['darksouls3', 'darksoulsiii.exe'], name: 'Dark Souls III' },
  { processes: ['monsterhunterworld', 'monsterhunterworld.exe'], name: 'Monster Hunter: World' },
  { processes: ['monsterhunterrise', 'monsterhunterrise.exe'], name: 'Monster Hunter Rise' },
  { processes: ['dragonsdogma2', 'dd2.exe'], name: "Dragon's Dogma 2" },
  { processes: ['persona5royal', 'p5r.exe'], name: 'Persona 5 Royal' },
  { processes: ['persona3reload', 'p3r.exe'], name: 'Persona 3 Reload' },
  { processes: ['finalfantasyxiv', 'ffxiv', 'ffxiv_dx11', 'ffxiv_dx11.exe'], name: 'Final Fantasy XIV' },
  { processes: ['finalfantasyxvi', 'ffxvi', 'ffxvi.exe'], name: 'Final Fantasy XVI' },
  { processes: ['finalfantasyvii', 'ff7remake', 'ff7remake.exe'], name: 'Final Fantasy VII Remake' },
  { processes: ['genshinimpact', 'genshinimpact.exe', 'yuanshen.exe'], name: 'Genshin Impact' },
  { processes: ['honkaistarrail', 'starrail', 'starrail.exe'], name: 'Honkai: Star Rail' },
  { processes: ['zenlesszonezero', 'zenlesszonezero.exe', 'zzz.exe'], name: 'Zenless Zone Zero' },
  { processes: ['wutheringwaves', 'wutheringwaves.exe', 'client-win64-shipping'], name: 'Wuthering Waves' },
  { processes: ['toweroffantasy', 'toweroffantasy.exe'], name: 'Tower of Fantasy' },
  { processes: ['godofwar', 'godofwar.exe'], name: 'God of War' },
  { processes: ['ghostoftsushima', 'ghostoftsushima.exe'], name: 'Ghost of Tsushima' },
  { processes: ['horizonforbiddenwest', 'horizonforbiddenwest.exe'], name: 'Horizon Forbidden West' },
  { processes: ['sekiro', 'sekiro.exe'], name: 'Sekiro: Shadows Die Twice' },
  { processes: ['nierautomata', 'nierautomata.exe'], name: 'NieR:Automata' },
  { processes: ['kingdomhearts3', 'kingdom hearts iii.exe'], name: 'Kingdom Hearts III' },
  { processes: ['dragonage', 'dragonagetheveilguard.exe'], name: 'Dragon Age: The Veilguard' },

  // ── MMO ──
  { processes: ['wow', 'wow.exe', 'wowclassic', 'wowclassic.exe'], name: 'World of Warcraft' },
  { processes: ['gw2', 'gw2-64', 'gw2-64.exe'], name: 'Guild Wars 2' },
  { processes: ['newworld', 'newworld.exe'], name: 'New World' },
  { processes: ['eso', 'eso64', 'eso.exe'], name: 'The Elder Scrolls Online' },
  { processes: ['runelite', 'osrs', 'jagexlauncher'], name: 'Old School RuneScape' },
  { processes: ['albion', 'albion-online'], name: 'Albion Online' },
  { processes: ['blackdesert', 'blackdesert64.exe'], name: 'Black Desert Online' },
  { processes: ['warcraft', 'wowt', 'wowb'], name: 'World of Warcraft' },

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
  { processes: ['manor lords', 'manorlords.exe'], name: 'Manor Lords' },
  { processes: ['frostpunk2', 'frostpunk2.exe', 'frostpunk'], name: 'Frostpunk 2' },
  { processes: ['northgard', 'northgard.exe'], name: 'Northgard' },
  { processes: ['planetzoo', 'planetzoo.exe'], name: 'Planet Zoo' },
  { processes: ['planetcoaster', 'planetcoaster2.exe'], name: 'Planet Coaster 2' },

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

  // ── Battle Arena / Card / Auto-Battler ──
  { processes: ['hearthstone', 'hearthstone.exe'], name: 'Hearthstone' },
  { processes: ['teamfighttactics', 'tft'], name: 'Teamfight Tactics' },
  { processes: ['mtga', 'mtga.exe'], name: 'Magic: The Gathering Arena' },
  { processes: ['yugioh', 'masterduel', 'masterduel.exe'], name: 'Yu-Gi-Oh! Master Duel' },
  { processes: ['marvelsnap', 'snap.exe'], name: 'Marvel Snap' },

  // ── Simulation / Management ──
  { processes: ['thesims4', 'ts4_x64', 'ts4_x64.exe'], name: 'The Sims 4' },
  { processes: ['msfs', 'flightsimulator', 'flightsimulator.exe'], name: 'Microsoft Flight Simulator' },
  { processes: ['euro truck simulator 2', 'eurotrucks2.exe'], name: 'Euro Truck Simulator 2' },
  { processes: ['farmingsimulator', 'farmingsimulator2022.exe'], name: 'Farming Simulator' },
  { processes: ['stardewvalley', 'stardew valley', 'stardew valley.exe'], name: 'Stardew Valley' },
  { processes: ['animalcrossing', 'yuzu'], name: 'Animal Crossing' },

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

  // ── Fighting ──
  { processes: ['streetfighter6', 'streetfighter6.exe', 'sf6'], name: 'Street Fighter 6' },
  { processes: ['tekken8', 'tekken8.exe'], name: 'Tekken 8' },
  { processes: ['mortalkombat1', 'mk1.exe', 'mortalkombat'], name: 'Mortal Kombat 1' },
  { processes: ['dragonballfighterz', 'dbfz', 'dbfz.exe'], name: 'Dragon Ball FighterZ' },
  { processes: ['granblue', 'gbvsr', 'gbvsr.exe'], name: 'Granblue Fantasy Versus: Rising' },
  { processes: ['guiltygearstrive', 'ggst', 'ggst.exe'], name: 'Guilty Gear -Strive-' },

  // ── Open World / Adventure ──
  { processes: ['gtav', 'gta5', 'gta5.exe', 'playgtav.exe'], name: 'Grand Theft Auto V' },
  { processes: ['gta6'], name: 'Grand Theft Auto VI' },
  { processes: ['rdr2', 'rdr2.exe'], name: 'Red Dead Redemption 2' },
  { processes: ['spidermanremastered', 'spiderman.exe'], name: "Marvel's Spider-Man" },
  { processes: ['zelda', 'totk', 'botw'], name: 'The Legend of Zelda' },
  { processes: ['assassinscreed', 'acmirage', 'acodyssey', 'acvalhalla'], name: "Assassin's Creed" },
  { processes: ['dyinglight2', 'dyinglight2.exe'], name: 'Dying Light 2' },
  { processes: ['alanwake2', 'alanwake2.exe'], name: 'Alan Wake 2' },
  { processes: ['deathstranding', 'ds.exe'], name: 'Death Stranding' },
  { processes: ['thelastofus', 'tlou-i', 'tlou-i.exe'], name: 'The Last of Us Part I' },
  { processes: ['control', 'control_dx12.exe'], name: 'Control' },

  // ── Co-op / Multiplayer Survival ──  
  { processes: ['deeprockgalactic', 'fsd-win64-shipping.exe'], name: 'Deep Rock Galactic' },
  { processes: ['left4dead2', 'left4dead2.exe'], name: 'Left 4 Dead 2' },
  { processes: ['backfourbload', 'back4blood', 'b4b-win64-shipping.exe'], name: 'Back 4 Blood' },
  { processes: ['seaofthieves', 'seaofthieves.exe'], name: 'Sea of Thieves' },
  { processes: ['gtfo', 'gtfo.exe'], name: 'GTFO' },
  { processes: ['readyornot', 'readyornot-win64-shipping.exe'], name: 'Ready or Not' },
  { processes: ['payday3', 'payday3-win64-shipping.exe', 'payday2'], name: 'PAYDAY 3' },

  // ── Roguelike / Roguelite ──
  { processes: ['slaythespire', 'slaythespire.exe'], name: 'Slay the Spire' },
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

  // ── Misc Popular ──
  { processes: ['hearthstone', 'hearthstone.exe'], name: 'Hearthstone' },
  { processes: ['chess', 'lichess', 'chess.com'], name: 'Chess' },
  { processes: ['geoguessr'], name: 'GeoGuessr' },
  { processes: ['idleslayer', 'idle slayer'], name: 'Idle Slayer' },

  // ── Streaming / Content Apps (shown as activity) ──
  { processes: ['obs64', 'obs32', 'obs64.exe', 'obs32.exe', 'obs'], name: 'OBS Studio', type: 'streaming' },
  { processes: ['streamlabs obs', 'streamlabs'], name: 'Streamlabs', type: 'streaming' },
  { processes: ['spotify', 'spotify.exe'], name: 'Spotify', type: 'listening' },
];

// Build a fast lookup map: processName → game entry
const processLookup = new Map();
for (const game of GAME_DATABASE) {
  for (const proc of game.processes) {
    processLookup.set(proc.toLowerCase(), game);
  }
}

/**
 * Get the list of running processes on the system.
 * Returns an array of lowercase process names.
 */
function getRunningProcesses() {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    let cmd;

    if (platform === 'win32') {
      // Windows: use tasklist /FO CSV to get process names
      cmd = 'tasklist /FO CSV /NH';
    } else if (platform === 'darwin') {
      // macOS: use ps
      cmd = 'ps -eo comm=';
    } else {
      // Linux: use ps
      cmd = 'ps -eo comm=';
    }

    exec(cmd, { maxBuffer: 1024 * 1024 * 5, timeout: 10000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      const processes = new Set();
      const lines = stdout.split('\n');

      for (const line of lines) {
        let name;
        if (platform === 'win32') {
          // CSV format: "process.exe","PID","Session","Session#","Mem"
          const match = line.match(/^"([^"]+)"/);
          if (match) {
            name = match[1].toLowerCase();
          }
        } else {
          name = line.trim().toLowerCase();
          // Extract just the binary name (strip path)
          if (name.includes('/')) {
            name = name.split('/').pop();
          }
        }
        if (name) {
          processes.add(name);
          // Also add without .exe extension for matching
          if (name.endsWith('.exe')) {
            processes.add(name.slice(0, -4));
          }
        }
      }

      resolve(processes);
    });
  });
}

/**
 * Detect running games by matching process names against the database.
 * Returns the first matched game (highest priority = first in list).
 */
async function detectGame() {
  try {
    const running = await getRunningProcesses();

    // Check against game database — first match wins (priority order)
    for (const game of GAME_DATABASE) {
      for (const proc of game.processes) {
        if (running.has(proc.toLowerCase())) {
          return {
            name: game.name,
            type: game.type || 'playing',
            process: proc,
          };
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[GameDetector] Process scan failed:', err.message);
    return null;
  }
}

// ── Game Detection Manager ──────────────────────────────────
class GameDetector {
  constructor() {
    this.interval = null;
    this.currentGame = null;
    this.onGameDetected = null;   // callback(game)
    this.onGameExited = null;     // callback()
    this.pollIntervalMs = 15000;  // 15 seconds
    this.enabled = true;
  }

  /**
   * Start polling for running games.
   * @param {Function} onDetected - Called with { name, type, process } when a game starts
   * @param {Function} onExited - Called when the detected game process exits
   */
  start(onDetected, onExited) {
    this.onGameDetected = onDetected;
    this.onGameExited = onExited;
    this.poll(); // Initial immediate scan
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
        // New game detected (or switched games)
        this.currentGame = game;
        console.log('[GameDetector] Detected:', game.name);
        if (this.onGameDetected) this.onGameDetected(game);
      } else if (!game && this.currentGame) {
        // Game exited
        console.log('[GameDetector] Game exited:', this.currentGame.name);
        this.currentGame = null;
        if (this.onGameExited) this.onGameExited();
      }
    } catch (err) {
      console.error('[GameDetector] Poll error:', err.message);
    }
  }

  /** Get the full game database for the client settings UI */
  getGameList() {
    return GAME_DATABASE
      .filter(g => !g.type || g.type === 'playing') // Only actual games
      .map(g => g.name);
  }

  /** Get the currently detected game, if any */
  getCurrentGame() {
    return this.currentGame;
  }
}

module.exports = { GameDetector, GAME_DATABASE };
