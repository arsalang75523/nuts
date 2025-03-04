import { Button, Frog, TextInput, FrameContext } from 'frog';
import { devtools } from 'frog/dev';
import { handle } from 'frog/next';
import { serveStatic } from 'frog/serve-static';
import { DuneClient } from '@duneanalytics/client-sdk';

interface CustomFrameContext extends FrameContext {
  frameSignaturePacket?: { fid?: number };
}

interface Cast {
  text: string;
  fid: number;
  parent_fid: number | null;
  timestamp?: string;
}

interface PeanutData {
  earningCount: number;
  username: string;
  profileImage: string | null;
  entityId: string;
  error?: string;
}

interface AllowanceData {
  allowance: number;
  username: string;
  profileImage: string | null;
  entityId: string;
  error?: string;
}

interface LeaderboardEntry {
  fid: string;
  peanutCount: number;
  rank: number;
  username: string;
}

let cachedResults: any = null;
let cachedLeaderboard: any = null;
let lastFetchTime: number = 0;
let lastCacheRefresh: number = 0;
const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 دقیقه
const profileCache: Record<string, { username: string; profileImage: string | null }> = {};

const UPDATE_TIMES = [
  { hour: 3, minute: 0 },  // 03:00 UTC
  { hour: 18, minute: 0 }, // 18:00 UTC
  { hour: 21, minute: 0 }, // 21:00 UTC
];

// @ts-ignore - Suppress unused function warning
function shouldUpdateData(): boolean {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  const shouldUpdate = UPDATE_TIMES.some(
    (time) => currentHour === time.hour && currentMinute === time.minute && Date.now() - lastFetchTime > 60 * 1000
  );
  console.log(`Checking update: ${now.toUTCString()}, Should update? ${shouldUpdate}`);
  return shouldUpdate;
}

export const app = new Frog({ title: 'Peanut Casts Frame' });
app.use('/*', serveStatic({ root: './public' }));

async function fetchPeanutData(fid: string): Promise<PeanutData> {
  const duneApiKey = 'DAYsTOPSdZQVwJNe4RUL3Cy9wtDSidjn';
  const airstackApiKey = '13827f8b8c521443da97ed54d4d6a891d';
  const dune = new DuneClient(duneApiKey);
  const duneQueryId = 4801893;
  
  if (Date.now() - lastCacheRefresh > CACHE_REFRESH_INTERVAL || !cachedResults) {
    console.log('Fetching new data from Dune for Peanut...');
    try {
      const queryResult = await dune.getLatestResult({ queryId: duneQueryId });
      cachedResults = queryResult;
      lastFetchTime = Date.now();
      lastCacheRefresh = Date.now();
    } catch (error: any) {
      console.error('Error fetching Dune data:', error);
    }
  } else {
    console.log('Using cached Dune data for Peanut...');
  }

  const rawCasts: Cast[] = (cachedResults?.result?.rows || []) as Cast[];
  const casts: Cast[] = rawCasts.filter((row) => row != null && typeof row === 'object');

  const earningCount = casts.reduce((count, cast) => {
    return cast.parent_fid?.toString() === fid ? count + (cast.text.match(/🥜/g) || []).length : count;
  }, 0);
  console.log(`Earning count for FID ${fid}: ${earningCount}`);

  let username = 'N/A';
  let profileImage: string | null = null;
  if (profileCache[fid]) {
    username = profileCache[fid].username;
    profileImage = profileCache[fid].profileImage;
  } else {
    const airstackQuery = `
      query MyQuery($filter: SocialFilter = {}) {
        Socials(input: {filter: $filter, blockchain: ethereum}) {
          Social {
            profileName
            profileImage
            userId
          }
        }
      }
    `;
    const variables = { filter: { dappName: { _eq: "farcaster" }, userId: { _eq: fid } } };
    try {
      const airstackResponse = await fetch('https://api.airstack.xyz/gql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': airstackApiKey },
        body: JSON.stringify({ query: airstackQuery, variables }),
      });
      const airstackResult = await airstackResponse.json();
      const social = airstackResult.data?.Socials?.Social?.[0] || {};
      username = social.profileName || 'N/A';
      profileImage = social.profileImage || null;
      profileCache[fid] = { username, profileImage };
    } catch (error: any) {
      console.error('Error fetching Airstack data:', error);
    }
  }

  return { earningCount, username, profileImage, entityId: fid, error: cachedResults ? undefined : 'API error' };
}

async function fetchAllowanceData(fid: string): Promise<AllowanceData> {
  const duneApiKey = 'DAYsTOPSdZQVwJNe4RUL3Cy9wtDSidjn';
  const airstackApiKey = '13827f8b8c521443da97ed54d4d6a891d';
  const dune = new DuneClient(duneApiKey);
  const duneQueryId = 4801893;

  if (Date.now() - lastCacheRefresh > CACHE_REFRESH_INTERVAL || !cachedResults) {
    console.log('Fetching new data from Dune for Allowance...');
    try {
      const queryResult = await dune.getLatestResult({ queryId: duneQueryId });
      cachedResults = queryResult;
      lastFetchTime = Date.now();
      lastCacheRefresh = Date.now();
    } catch (error: any) {
      console.error('Error fetching Dune data:', error);
    }
  } else {
    console.log('Using cached Dune data for Allowance...');
  }

  const rawCasts: Cast[] = (cachedResults?.result?.rows || []) as Cast[];
  const casts: Cast[] = rawCasts.filter((row) => row != null && typeof row === 'object');

  const usedPeanuts = casts
    .filter((cast) => cast.fid.toString() === fid)
    .reduce((count, cast) => count + (cast.text.match(/🥜/g) || []).length, 0);
  const initialAllowance = 30;
  const allowance = Math.max(0, initialAllowance - usedPeanuts);

  let username = 'N/A';
  let profileImage: string | null = null;
  if (profileCache[fid]) {
    username = profileCache[fid].username;
    profileImage = profileCache[fid].profileImage;
  } else {
    const airstackQuery = `
      query MyQuery($filter: SocialFilter = {}) {
        Socials(input: {filter: $filter, blockchain: ethereum}) {
          Social {
            profileName
            profileImage
            userId
          }
        }
      }
    `;
    const variables = { filter: { dappName: { _eq: "farcaster" }, userId: { _eq: fid } } };
    try {
      const airstackResponse = await fetch('https://api.airstack.xyz/gql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': airstackApiKey },
        body: JSON.stringify({ query: airstackQuery, variables }),
      });
      const airstackResult = await airstackResponse.json();
      const social = airstackResult.data?.Socials?.Social?.[0] || {};
      username = social.profileName || 'N/A';
      profileImage = social.profileImage || null;
      profileCache[fid] = { username, profileImage };
    } catch (error: any) {
      console.error('Error fetching Airstack data:', error);
    }
  }

  return { allowance, username, profileImage, entityId: fid, error: cachedResults ? undefined : 'API error' };
}

async function fetchLeaderboardData(userFid: string): Promise<LeaderboardEntry[]> {
  const duneApiKey = 'DAYsTOPSdZQVwJNe4RUL3Cy9wtDSidjn';
  const airstackApiKey = '13827f8b8c521443da97ed54d4d6a891d';
  const dune = new DuneClient(duneApiKey);
  const leaderboardQueryId = 4801919;

  if (Date.now() - lastCacheRefresh > CACHE_REFRESH_INTERVAL || !cachedLeaderboard) {
    console.log('Fetching new leaderboard data from Dune...');
    try {
      const queryResult = await dune.getLatestResult({ queryId: leaderboardQueryId });
      cachedLeaderboard = queryResult;
      lastFetchTime = Date.now();
      lastCacheRefresh = Date.now();
    } catch (error: any) {
      console.error('Error fetching leaderboard data:', error);
    }
  } else {
    console.log('Using cached leaderboard data...');
  }

  const rawData = (cachedLeaderboard?.result?.rows || []) as { fid: string | number; peanut_count: number }[];
  const sortedData = rawData
    .map((entry, index) => ({
      fid: String(entry.fid),
      peanutCount: entry.peanut_count,
      rank: index + 1,
      username: '',
    }))
    .sort((a, b) => b.peanutCount - a.peanutCount);

  const top9 = sortedData.slice(0, 9);
  const userEntry = sortedData.find((entry) => entry.fid === userFid) || {
    fid: userFid,
    peanutCount: (await fetchPeanutData(userFid)).earningCount,
    rank: sortedData.findIndex((entry) => entry.fid === userFid) + 1 || sortedData.length + 1,
    username: '',
  };
  const leaderboard = [...top9, userEntry];
  const fids = leaderboard.map(entry => entry.fid);

  const airstackQuery = `
    query MyQuery($filter: SocialFilter = {}) {
      Socials(input: {filter: $filter, blockchain: ethereum}) {
        Social {
          profileName
          userId
        }
      }
    }
  `;
  const variables = { filter: { dappName: { _eq: "farcaster" }, userId: { _in: fids } } };
  try {
    const airstackResponse = await fetch('https://api.airstack.xyz/gql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': airstackApiKey },
      body: JSON.stringify({ query: airstackQuery, variables }),
    });
    const airstackResult = await airstackResponse.json();
    const socials = airstackResult.data?.Socials?.Social || [];
    socials.forEach((social: any) => {
      const entry = leaderboard.find(e => e.fid === social.userId);
      if (entry) {
        entry.username = social.profileName || 'N/A';
      }
    });
  } catch (error: any) {
    console.error('Error fetching Airstack leaderboard data:', error);
  }

  return leaderboard;
}

async function fetchUserPeanutCount(fid: string): Promise<number> {
  const duneApiKey = 'DAYsTOPSdZQVwJNe4RUL3Cy9wtDSidjn';
  const dune = new DuneClient(duneApiKey);
  const leaderboardQueryId = 4801919;

  if (Date.now() - lastCacheRefresh > CACHE_REFRESH_INTERVAL || !cachedLeaderboard) {
    console.log('Fetching new leaderboard data for peanut count...');
    try {
      const queryResult = await dune.getLatestResult({ queryId: leaderboardQueryId });
      cachedLeaderboard = queryResult;
      lastFetchTime = Date.now();
      lastCacheRefresh = Date.now();
    } catch (error: any) {
      console.error('Error fetching leaderboard data:', error);
    }
  } else {
    console.log('Using cached leaderboard data for peanut count...');
  }

  const rawData = (cachedLeaderboard?.result?.rows || []) as { fid: string | number; peanut_count: number }[];
  console.log(`Raw leaderboard data: ${JSON.stringify(rawData)}`);

  const sortedData = rawData
    .map((entry) => ({
      fid: String(entry.fid),
      peanutCount: entry.peanut_count,
    }))
    .sort((a, b) => b.peanutCount - a.peanutCount);

  const userEntry = sortedData.find((entry) => entry.fid === fid);
  console.log(`Found user entry in leaderboard for FID ${fid}: ${JSON.stringify(userEntry)}`);

  if (userEntry) {
    return userEntry.peanutCount;
  }

  // خط 352: اضافه کردن @ts-ignore برای peanutData
  // @ts-ignore - Suppress unused variable warning
  const peanutData = await fetchPeanutData(fid);
  console.log(`Falling back to fetchPeanutData for FID ${fid}: ${peanutData.earningCount}`);
  return peanutData.earningCount;
}

async function fetchUserRank(fid: string): Promise<number> {
  const duneApiKey = 'DAYsTOPSdZQVwJNe4RUL3Cy9wtDSidjn';
  const dune = new DuneClient(duneApiKey);
  const leaderboardQueryId = 4801919;

  if (Date.now() - lastCacheRefresh > CACHE_REFRESH_INTERVAL || !cachedLeaderboard) {
    console.log('Fetching new leaderboard data for rank...');
    try {
      const queryResult = await dune.getLatestResult({ queryId: leaderboardQueryId });
      cachedLeaderboard = queryResult;
      lastFetchTime = Date.now();
      lastCacheRefresh = Date.now();
    } catch (error: any) {
      console.error('Error fetching leaderboard data:', error);
    }
  } else {
    console.log('Using cached leaderboard data for rank...');
  }

  const rawData = (cachedLeaderboard?.result?.rows || []) as { fid: string | number; peanut_count: number }[];
  console.log(`Raw leaderboard data for rank: ${JSON.stringify(rawData)}`);

  const sortedData = rawData
    .map((entry, index) => ({
      fid: String(entry.fid),
      peanutCount: entry.peanut_count,
      rank: index + 1,
    }))
    .sort((a, b) => b.peanutCount - a.peanutCount);

  const userEntry = sortedData.find((entry) => entry.fid === fid);
  console.log(`Found user entry in leaderboard for rank FID ${fid}: ${JSON.stringify(userEntry)}`);

  if (userEntry) {
    return userEntry.rank;
  }

  const peanutData = await fetchPeanutData(fid);
  return sortedData.length + 1;
}



app.frame('/', async (c: CustomFrameContext) => {
  const { buttonValue, inputText, status } = c;
  const userFid = c.frameSignaturePacket?.fid ? String(c.frameSignaturePacket.fid) : null;
  const fid = userFid || inputText || '443855';
  let peanutData: PeanutData = { earningCount: 0, username: "Anonymous", profileImage: null, entityId: fid };

  let allowanceData: AllowanceData | null = null;
  let userPeanutCount: number | null = null;
  let userRank: number | null = null;
  function getOrGenerateHashId(fid: string): string {
    return `hash-${fid}-${Date.now()}`;
  }
  
  const hashId = getOrGenerateHashId(String(fid));

  const safeFid = encodeURIComponent(fid);
  const safeUsername = encodeURIComponent(peanutData?.username ?? "Anonymous");
  const safeProfileImage = encodeURIComponent(peanutData?.profileImage ?? "");


  if (fid) {
    peanutData = await fetchPeanutData(fid);
    allowanceData = await fetchAllowanceData(fid);
    userPeanutCount = await fetchUserPeanutCount(fid);
    userRank = await fetchUserRank(fid);
  }

  
  const shareText = ` I earned ${peanutData?.earningCount || 0} 🥜 today and have ${allowanceData?.allowance || 0} Allowance left!\n\nBackend by @arsalang75523 / FrontEnd by @jeyloo`;

  const shareUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(
    ` https://a6a5-109-61-80-200.ngrok-free.app/?hashid=${hashId}&fid=${safeFid}&username=${safeUsername}&pfpUrl=${safeProfileImage}`
  )}`;
  const formattedEarnings = peanutData?.earningCount.toLocaleString('en-US') || '0';
  const formattedAllowance = allowanceData?.allowance.toLocaleString('en-US') || '0';
  const formattedRank = userRank?.toLocaleString('en-US') || 'N/A';
  const formattedPeanutCount = userPeanutCount?.toLocaleString('en-US') || '0';

  return c.res({
    image: (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(120deg, #1e3c72 0%, #2a5298 50%, #6b7280 100%)',
          height: '100%',
          width: '100%',
          fontFamily: '"Inter", sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)',
            animation: 'rotate 20s linear infinite',
            opacity: 0.15,
          }}
        />
        {peanutData && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              padding: '20px',
              color: '#e0e7ff',
              fontSize: '28px',
              fontWeight: 700,
              textShadow: '0 2px 4px rgba(0,0,0,0.3)',
              zIndex: 1,
            }}
          >
            <span>FID: {peanutData.entityId}</span>
          </div>
        )}
        {peanutData?.profileImage && (
          <img
            src={peanutData.profileImage}
            style={{
              width: '270px',
              height: '270px',
              borderRadius: '50%',
              border: '6px solid #ffffff',
              boxShadow: '0 8px 16px rgba(0,0,0,0.25)',
              marginBottom: '40px',
              zIndex: 1,
              objectFit: 'cover',
              transition: 'transform 0.3s ease-in-out',
            }}
          />
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '20px',
            padding: '40px',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(8px)',
            zIndex: 1,
            width: '1150px',
          }}
        >
          {peanutData && allowanceData ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                width: '100%',
                gap: '150px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  color: '#fff',
                }}
              >
                <span style={{ fontSize: '60px' }}>🥜</span>
                <span style={{ fontSize: '27px', opacity: 0.8 }}>Today Earning</span>
                <span style={{ fontSize: '40px', fontWeight: 700 }}>{formattedEarnings}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  color: '#fff',
                }}
              >
                <span style={{ fontSize: '60px' }}>💰</span>
                <span style={{ fontSize: '27px', opacity: 0.8 }}>remaining Allowance</span>
                <span style={{ fontSize: '40px', fontWeight: 700 }}>{formattedAllowance}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  color: '#fff',
                }}
              >
                <span style={{ fontSize: '60px' }}>🏅</span>
                <span style={{ fontSize: '27px', opacity: 0.8 }}>Rank</span>
                <span style={{ fontSize: '40px', fontWeight: 700 }}>{formattedRank}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  color: '#fff',
                }}
              >
                <span style={{ fontSize: '60px' }}>🌰</span>
                <span style={{ fontSize: '27px', opacity: 0.8 }}>all time earning</span>
                <span style={{ fontSize: '40px', fontWeight: 700 }}>{formattedPeanutCount}</span>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                fontSize: '26px',
                fontWeight: 600,
                color: '#e0e7ff',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              Checking...
            </div>
          )}
        </div>
        {peanutData?.error || allowanceData?.error ? (
          <div
            style={{
              display: 'flex',
              marginTop: '20px',
              fontSize: '18px',
              color: '#ff6b6b',
              background: 'rgba(255,107,107,0.2)',
              padding: '10px 20px',
              borderRadius: '10px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
              zIndex: 1,
            }}
          >
            {peanutData?.error || allowanceData?.error}
          </div>
        ) : null}
      </div>
    ),
    intents: [
      <TextInput placeholder="Enter Farcaster FID..." />,
      <Button value="check">Check</Button>,
      <Button action="/leaderboard" value={fid}>Leaderboard</Button>,
      <Button.Link href={shareUrl}>📤 Share</Button.Link>,
      status === 'response' && <Button.Reset>Reset</Button.Reset>,
    ],
  });
});

app.frame('/leaderboard', async (c: CustomFrameContext) => {
  // خط 357: اضافه کردن @ts-ignore برای buttonValue
  // @ts-ignore - Suppress unused variable warning
  const buttonValue = c.buttonValue;
  const userFid = buttonValue || (c.frameSignaturePacket?.fid ? String(c.frameSignaturePacket.fid) : '443855');
  const leaderboard = await fetchLeaderboardData(userFid);

  return c.res({
    image: (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #2a0845 0%, #6441a5 100%)',
          height: '100%',
          width: '100%',
          fontFamily: '"Inter", sans-serif',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)',
            animation: 'rotate 25s linear infinite',
            opacity: 0.1,
          }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: '36px',
            fontWeight: 700,
            marginBottom: '30px',
            textShadow: '0 4px 8px rgba(0,0,0,0.3)',
            zIndex: 1,
          }}
        >
          Leaderboard 🏆
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '21px',
            width: '1000px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '15px',
            padding: '18px',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(6px)',
            zIndex: 1,
          }}
        >
          {leaderboard.map((entry) => (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 15px',
                background: entry.fid === userFid ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                transition: 'transform 0.2s ease-in-out',
              }}
            >
              <span>{entry.rank}. {entry.username || `FID: ${entry.fid}`}</span>
              <span>{entry.peanutCount} 🥜</span>
            </div>
          ))}
        </div>
      </div>
    ),
    intents: [<Button action="/">Back</Button>],
  });
});

devtools(app, { serveStatic });

export const GET = handle(app);
export const POST = handle(app);

function getOrGenerateHashId(_arg0: string) {
  throw new Error('Function not implemented.');
}
