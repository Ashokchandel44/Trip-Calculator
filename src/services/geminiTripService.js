const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

const GROUNDED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function generateTripEstimate(formData) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Travel planner is not configured yet. Add your API key in the .env file.');
  }

  const prompt = buildPrompt(formData);
  const config = {
    temperature: 0.25,
    maxOutputTokens: 2400,
    responseMimeType: 'application/json',
    tools: [{ googleSearch: {} }],
  };

  let lastError = null;

  for (const model of GROUNDED_MODELS) {
    try {
      return await requestGroundedTripEstimate({ apiKey, model, prompt, formData });
    } catch (error) {
      lastError = normalizeSdkError(error);

      if (lastError.code === 'AUTH' || lastError.code === 'RATE_LIMIT') {
        break;
      }
    }
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  for (const model of GEMINI_MODELS) {
    try {
      return await requestTripEstimate({ ai, model, prompt, config, formData });
    } catch (error) {
      lastError = normalizeSdkError(error);

      if (lastError.code === 'TOOL_OR_SCHEMA') {
        try {
          return await requestTripEstimate({
            ai,
            model,
            prompt,
            config: {
              temperature: config.temperature,
              maxOutputTokens: config.maxOutputTokens,
              responseMimeType: config.responseMimeType,
            },
            formData,
          });
        } catch (retryError) {
          lastError = normalizeSdkError(retryError);
        }
      }

      if (lastError.code === 'AUTH' || lastError.code === 'RATE_LIMIT') {
        break;
      }
    }
  }

  if (lastError?.code === 'AUTH' || lastError?.code === 'RATE_LIMIT') {
    throw lastError;
  }

  try {
    const routeEstimate = await requestRouteDistanceOnly({ apiKey, formData });
    return buildLocalEstimate(formData, lastError, routeEstimate);
  } catch {
    return buildLocalEstimate(formData, lastError);
  }
}

async function requestGroundedTripEstimate({ apiKey, model, prompt, formData }) {
  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2600,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createApiError(response.status, errorText);
  }

  const data = await response.json();
  const rawText = extractGeminiText(data);
  const parsed = parseGeminiJson(rawText);

  return normalizeTripResult(parsed, rawText, formData);
}

function extractGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';
}

async function requestRouteDistanceOnly({ apiKey, formData }) {
  const prompt = `
Return valid JSON only.
Find the practical driving road distance and driving time for this route:
From: ${formData.startingLocation}
To: ${formData.destinationLocation}

Use search-grounded/common map distance if available. Do not guess a generic value.
Shape:
{
  "estimatedDistance": "236 km",
  "estimatedTravelTime": "5 hours 1 minute"
}
`.trim();

  const response = await fetch(`${GEMINI_API_BASE}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.05,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createApiError(response.status, errorText);
  }

  const data = await response.json();
  return parseGeminiJson(extractGeminiText(data));
}

async function requestTripEstimate({ ai, model, prompt, config, formData }) {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config,
  });

  const rawText = response.text || '';
  const parsed = parseGeminiJson(rawText);

  return normalizeTripResult(parsed, rawText, formData);
}

function normalizeSdkError(error) {
  if (error?.code) {
    return error;
  }

  const message = error?.message || String(error);
  const parsed = parseSdkErrorMessage(message);
  const status = parsed?.error?.code || error?.status;
  const normalized = new Error(getFriendlyApiError(status, message));

  if (status === 401 || status === 403) {
    normalized.code = 'AUTH';
  }

  if (status === 429) {
    normalized.code = 'RATE_LIMIT';
  }

  if (status === 400 && /tool|schema|responseMimeType|response_mime_type|googleSearch/i.test(message)) {
    normalized.code = 'TOOL_OR_SCHEMA';
  }

  return normalized;
}

function parseSdkErrorMessage(message) {
  const jsonStart = message.indexOf('{');
  const jsonEnd = message.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return null;
  }

  try {
    return JSON.parse(message.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
}

function buildPrompt(formData) {
  const interests = formData.interests.length ? formData.interests.join(', ') : 'none selected';

  return `
You are a travel planning and budget estimation assistant.

Estimate realistic trip details without paid maps APIs. Use conservative, commonly accepted road distances. Do not inflate distance or cost.
For estimatedDistance, return the practical driving/road distance between the exact starting location and destination, not straight-line distance and not a generic city-to-city guess.
If search/grounding shows a distance snippet, prefer that route distance and keep it within a realistic range.
Use web-grounded knowledge/search when available for distance, route time, and practical road travel details.
Do not invent exact facts. If unsure, keep the estimate conservative.
For India trips, return cost ranges in INR and keep them practical for a normal traveler.

User input:
- Starting location: ${formData.startingLocation}
- Destination location: ${formData.destinationLocation}
- Number of travelers: ${formData.travelers}
- Travel date: ${formData.travelDate}
- Return date: ${formData.returnDate || 'not provided'}
- Trip duration in days: ${formData.durationDays || 'calculate from dates if possible'}
- Budget level: ${formData.budgetLevel}
- Interests: ${interests}

Return valid JSON only. Do not include markdown, code fences, comments, or extra text.
Transport cost can be a rough value because the app will calculate private car, taxi, and bike costs separately.

Use this exact JSON shape:
{
  "route": {
    "from": "string",
    "to": "string"
  },
  "estimatedDistance": "string, include unit",
  "estimatedTravelTime": "string",
  "suggestedTravelMode": "string",
  "transportCost": "string with currency or clear estimate",
  "accommodationCost": "string with currency or clear estimate",
  "foodCost": "string with currency or clear estimate",
  "totalBudget": "string with currency or clear estimate",
  "bestTimeToTravel": "string",
  "travelTips": ["tip 1", "tip 2", "tip 3", "tip 4", "tip 5"],
  "miniItinerary": [
    { "day": "Day 1", "plan": "string" },
    { "day": "Day 2", "plan": "string" }
  ],
  "routeHighlights": [
    { "name": "place name", "description": "why to stop here" }
  ],
  "thingsToAvoid": ["string"],
  "packingSuggestions": ["string"],
  "assumptions": ["string"]
}
`.trim();
}

function buildLocalEstimate(formData, error, routeEstimate = {}) {
  return normalizeTripResult(
    {
      route: {
        from: formData.startingLocation,
        to: formData.destinationLocation,
      },
      estimatedDistance: routeEstimate.estimatedDistance || '',
      estimatedTravelTime: routeEstimate.estimatedTravelTime || '',
      suggestedTravelMode: 'Private car',
      bestTimeToTravel: 'Travel early morning for better traffic and safer road conditions.',
      travelTips: [
        'Start early and keep buffer time for traffic or weather delays.',
        'Compare private car, taxi, bike, and bus options before booking.',
        'Book stay near the main market or route exit if you want easier local transport.',
        'Carry cash for tolls, parking, snacks, and small local shops.',
        'Check weather, road status, and hotel cancellation policy before departure.',
      ],
      miniItinerary: buildFallbackItinerary(formData),
      routeHighlights: buildFallbackHighlights(formData),
      accessInfo: getGenericRouteAccessInfo(formData),
      thingsToAvoid: [
        'Avoid starting late for hill routes.',
        'Avoid overpacking if traveling by bike or bus.',
        'Avoid booking hotels without checking recent reviews.',
      ],
      packingSuggestions: [
        'Government ID, medicines, charger, power bank, and comfortable shoes.',
        'Light jacket or rain layer depending on season.',
        'Water bottle, snacks, sunglasses, and basic cash.',
      ],
      assumptions: [
        routeEstimate.estimatedDistance
          ? 'Full trip planner was unavailable, so TravelwithAnki used a separate AI distance lookup.'
          : 'Online distance lookup was unavailable, so TravelwithAnki did not guess a route distance.',
        error?.message || 'Try again shortly for AI-grounded distance and station details.',
      ],
    },
    '',
    formData,
  );
}

function buildFallbackItinerary(formData) {
  const days = getTripDays(formData);
  const destination = formData.destinationLocation || 'destination';
  const plans = [
    { day: 'Day 1', plan: `Travel to ${destination}, check in, and explore the nearby market.` },
    { day: 'Day 2', plan: `Visit popular viewpoints, cafes, and local attractions around ${destination}.` },
    { day: 'Day 3', plan: 'Keep this day flexible for route stops, shopping, and return preparation.' },
  ];

  return plans.slice(0, Math.max(1, Math.min(days, plans.length)));
}

function parseGeminiJson(rawText) {
  if (!rawText.trim()) {
    throw new Error('Trip planner returned an empty response. Please try again.');
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      } catch {
        // Fall through to the friendly error below.
      }
    }
  }

  throw new Error('Trip planner could not read the response. Please try again with clearer trip details.');
}

function normalizeTripResult(result, rawText, formData) {
  const corrected = result;
  const distanceKm = parseDistanceKm(corrected.estimatedDistance);
  const travelTime = corrected.estimatedTravelTime || buildTravelTime(distanceKm);
  const accessInfo = normalizeAccessInfo(corrected?.accessInfo, formData);
  const transportOptions = buildTransportOptions(distanceKm, corrected, formData, accessInfo);
  const costSummary = buildCostSummary({ formData, transportOptions });
  const hotelLinks = buildHotelLinks(formData.destinationLocation || corrected?.route?.to);
  const routeHighlights = normalizeHighlights(corrected?.routeHighlights);

  return {
    route: {
      from: corrected?.route?.from || 'Starting location',
      to: corrected?.route?.to || 'Destination',
    },
    estimatedDistance: distanceKm ? `${distanceKm} km` : corrected?.estimatedDistance || 'Estimate unavailable',
    estimatedTravelTime: travelTime,
    suggestedTravelMode: corrected?.suggestedTravelMode || 'Private car',
    transportCost: transportOptions.privateCar.total,
    accommodationCost: costSummary.accommodationCost,
    foodCost: costSummary.foodCost,
    totalBudget: costSummary.totalBudget,
    totalByTransport: costSummary.totalByTransport,
    bestTimeToTravel: corrected?.bestTimeToTravel || 'Estimate unavailable',
    travelTips: ensureArray(corrected?.travelTips).slice(0, 5),
    miniItinerary: ensureArray(corrected?.miniItinerary),
    routeHighlights: routeHighlights.length ? routeHighlights : buildFallbackHighlights(formData),
    hotelLinks,
    accessInfo,
    thingsToAvoid: ensureArray(corrected?.thingsToAvoid),
    packingSuggestions: ensureArray(corrected?.packingSuggestions),
    assumptions: [
      ...ensureArray(corrected?.assumptions),
      'Distance and road costs are app-adjusted estimates, not live map or live tariff data.',
    ],
    transportOptions,
    rawText,
  };
}

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeHighlights(value) {
  return ensureArray(value).map((item) => {
    if (typeof item === 'string') {
      return { name: item, description: 'Popular stop on or around this route.' };
    }

    return {
      name: item?.name || 'Suggested place',
      description: item?.description || 'Worth checking during the trip.',
    };
  });
}

function normalizeAccessInfo(value, formData) {
  const known = getGenericRouteAccessInfo(formData);
  const oldShape = value && !value.origin && !value.destination;
  const origin = value?.origin || {};
  const destination = value?.destination || {};
  const originRail = origin.nearestRailwayStation || origin.nearest_railway_station;
  const originAirport = origin.nearestAirport || origin.nearest_airport;
  const destinationRail =
    destination.nearestRailwayStation ||
    destination.nearest_railway_station ||
    destination.nearest_practical_railway_station ||
    destination.nearestPracticalRailwayStation;
  const destinationAirport = destination.nearestAirport || destination.nearest_airport;

  return {
    origin: {
      nearestRailwayStation:
        formatAccessPlace(originRail) || known.origin.nearestRailwayStation,
      nearestAirport: formatAccessPlace(originAirport) || known.origin.nearestAirport,
    },
    destination: {
      nearestRailwayStation:
        formatAccessPlace(destinationRail) ||
        (oldShape ? value?.nearestRailwayStation : '') ||
        known.destination.nearestRailwayStation,
      railwayDistance:
        destination.railwayDistance ||
        destination.railway_distance ||
        getDistanceFromPlaceObject(destinationRail) ||
        (oldShape ? value?.railwayDistance : '') ||
        known.destination.railwayDistance,
      directTrainAvailable:
        destination.directTrainAvailable ||
        destination.direct_train_available ||
        (oldShape ? value?.directTrainAvailable : '') ||
        known.destination.directTrainAvailable,
      railwayTransfer:
        destination.railwayTransfer ||
        destination.railway_transfer ||
        buildTransferText(destinationRail, 'station') ||
        (oldShape ? value?.railwayTransfer : '') ||
        known.destination.railwayTransfer,
      nearestAirport:
        formatAccessPlace(destinationAirport) ||
        (oldShape ? value?.nearestAirport : '') ||
        known.destination.nearestAirport,
      airportDistance:
        destination.airportDistance ||
        destination.airport_distance ||
        getDistanceFromPlaceObject(destinationAirport) ||
        (oldShape ? value?.airportDistance : '') ||
        known.destination.airportDistance,
      directFlightAvailable:
        destination.directFlightAvailable ||
        destination.direct_flight_available ||
        (oldShape ? value?.directFlightAvailable : '') ||
        known.destination.directFlightAvailable,
      airportTransfer:
        destination.airportTransfer ||
        destination.airport_transfer ||
        buildTransferText(destinationAirport, 'airport') ||
        (oldShape ? value?.airportTransfer : '') ||
        known.destination.airportTransfer,
    },
  };
}

function formatAccessPlace(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  const name = value.name || value.station || value.airport || value.title;
  const code = value.code ? ` (${value.code})` : '';

  return name ? `${name}${code}` : '';
}

function buildTransferText(value, type) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const distance = getDistanceFromPlaceObject(value);

  if (!distance) {
    return '';
  }

  return `Continue by local taxi, bus, or private car from the ${type}.`;
}

function getDistanceFromPlaceObject(value) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const distanceEntry = Object.entries(value).find(([key, itemValue]) => {
    return /distance/i.test(key) && itemValue;
  });

  return distanceEntry?.[1] || '';
}

function getGenericRouteAccessInfo(formData) {
  return {
    origin: getGenericLocationAccessInfo(formData.startingLocation, 'origin'),
    destination: getGenericLocationAccessInfo(formData.destinationLocation, 'destination'),
  };
}

function getGenericLocationAccessInfo(location = '', type = 'destination') {
  return {
    nearestRailwayStation:
      type === 'origin'
        ? `Nearest railway station for ${location || 'starting location'} needs confirmation`
        : `Nearest railway station for ${location || 'destination'} needs confirmation`,
    railwayDistance: 'Distance depends on the exact city/locality.',
    directTrainAvailable: 'Direct train availability depends on the route.',
    railwayTransfer: 'Use local taxi, bus, or private car for last-mile transfer if needed.',
    nearestAirport:
      type === 'origin'
        ? `Nearest airport for ${location || 'starting location'} needs confirmation`
        : `Nearest airport for ${location || 'destination'} needs confirmation`,
    airportDistance: 'Airport distance depends on the exact city/locality.',
    directFlightAvailable: 'Direct flight availability depends on the route.',
    airportTransfer: 'Use local taxi, bus, or private car for airport transfer if needed.',
  };
}

function buildHotelLinks(destination) {
  const query = encodeURIComponent(`hotels in ${destination || 'destination'}`);
  const cleanDestination = encodeURIComponent(destination || 'destination');

  return [
    {
      label: 'Search hotels',
      url: `https://www.google.com/search?q=${query}`,
    },
    {
      label: 'Booking.com',
      url: `https://www.booking.com/searchresults.html?ss=${cleanDestination}`,
    },
    {
      label: 'MakeMyTrip',
      url: `https://www.makemytrip.com/hotels/hotel-listing/?searchText=${cleanDestination}`,
    },
  ];
}

function buildFallbackHighlights(formData) {
  return [
    {
      name: `${formData.destinationLocation} local market`,
      description: 'Good place to understand local food, shopping, and evening activity.',
    },
    {
      name: `${formData.destinationLocation} viewpoint`,
      description: 'Search nearby viewpoints before finalizing your day plan.',
    },
  ];
}

function normalizeLocation(value) {
  return String(value)
    .toLowerCase()
    .replace(/\bindia\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseDistanceKm(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  return match ? Math.round(Number(match[1])) : null;
}

function buildTravelTime(distanceKm) {
  if (!distanceKm) {
    return 'Estimate unavailable';
  }

  const minHours = Math.max(1, Math.round(distanceKm / 45));
  const maxHours = Math.max(minHours + 1, Math.round(distanceKm / 35));
  return `${minHours}-${maxHours} hours by road`;
}

function buildTransportOptions(distanceKm, result, formData, accessInfo) {
  const km = distanceKm || parseDistanceKm(result?.estimatedDistance) || 0;
  const unavailable = !km;
  const roundTripKm = km * 2;
  const travelers = Math.max(Number(formData.travelers) || 1, 1);
  const privateCarCost = roundToNearest(roundTripKm * 11, 50);
  const taxiCost = roundToNearest(roundTripKm * 16 + 1500, 100);
  const bikeCost = roundToNearest(roundTripKm * 3.2, 50);
  const busCost = roundToNearest(roundTripKm * 1.65 * travelers, 50);
  const routeNotes = getRouteModeNotes(formData.startingLocation, formData.destinationLocation, accessInfo);

  return {
    privateCar: {
      label: 'Private car',
      total: unavailable ? 'Distance needed' : formatInr(privateCarCost),
      status: 'Best for flexible stops',
      note: 'Fuel + basic wear estimate for round trip',
      breakdown: unavailable ? ['Calculate again for road distance', 'Approx ₹11/km running cost'] : [`${roundTripKm} km round trip`, 'Approx ₹11/km running cost'],
    },
    taxi: {
      label: 'Taxi',
      total: unavailable ? 'Distance needed' : formatInr(taxiCost),
      status: 'Comfortable but costly',
      note: 'Cab fare estimate for round trip',
      breakdown: unavailable ? ['Calculate again for road distance', 'Approx ₹16/km + driver allowance'] : [`${roundTripKm} km round trip`, 'Approx ₹16/km + driver allowance'],
    },
    bike: {
      label: 'Bike',
      total: unavailable ? 'Distance needed' : formatInr(bikeCost),
      status: 'Lowest fuel cost',
      note: 'Fuel estimate for round trip',
      breakdown: unavailable ? ['Calculate again for road distance', 'Approx ₹3.2/km fuel cost'] : [`${roundTripKm} km round trip`, 'Approx ₹3.2/km fuel cost'],
    },
    bus: {
      label: 'Bus',
      total: unavailable ? 'Check fare' : formatInr(busCost),
      status: routeNotes.busStatus,
      note: routeNotes.busNote,
      breakdown: [`${travelers} traveler${travelers === 1 ? '' : 's'}`, 'Approx ordinary/Volvo mixed fare estimate'],
    },
  };
}

function getRouteModeNotes() {
  return {
    busStatus: 'Check route availability',
    busNote: 'Bus estimate depends on direct service availability and operator type.',
  };
}

function buildCostSummary({ formData, transportOptions }) {
  const days = getTripDays(formData);
  const travelers = Math.max(Number(formData.travelers) || 1, 1);
  const rooms = Math.ceil(travelers / 2);
  const budgetRates = {
    economy: { stay: 1200, food: 450 },
    standard: { stay: 1800, food: 700 },
    premium: { stay: 3500, food: 1200 },
  };
  const rates = budgetRates[formData.budgetLevel] || budgetRates.standard;
  const accommodation = roundToNearest(rates.stay * Math.max(days - 1, 1) * rooms, 100);
  const food = roundToNearest(rates.food * days * travelers, 50);
  const privateCar = parseRupees(transportOptions.privateCar.total);
  const baseTotal = accommodation + food;
  const totalByTransport = {
    privateCar: `${formatInr(baseTotal + privateCar)} estimate with private car`,
    taxi: `${formatInr(baseTotal + parseRupees(transportOptions.taxi.total))} estimate with taxi`,
    bike: `${formatInr(baseTotal + parseRupees(transportOptions.bike.total))} estimate with bike`,
    bus: `${formatInr(baseTotal + parseRupees(transportOptions.bus.total))} estimate with bus`,
  };

  return {
    accommodationCost: `${formatInr(accommodation)} estimate`,
    foodCost: `${formatInr(food)} estimate`,
    totalBudget: totalByTransport.privateCar,
    totalByTransport,
  };
}

function getTripDays(formData) {
  if (Number(formData.durationDays) > 0) {
    return Number(formData.durationDays);
  }

  if (formData.travelDate && formData.returnDate) {
    const start = new Date(formData.travelDate);
    const end = new Date(formData.returnDate);
    const diffDays = Math.round((end - start) / 86400000) + 1;
    return Math.max(diffDays, 1);
  }

  return 1;
}

function parseRupees(value) {
  return Number(String(value).replace(/[^\d]/g, '')) || 0;
}

function roundToNearest(value, nearest) {
  return Math.round(value / nearest) * nearest;
}

function formatInr(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function createApiError(status, errorText = '') {
  const error = new Error(getFriendlyApiError(status, errorText));

  if (status === 401 || status === 403) {
    error.code = 'AUTH';
  }

  if (status === 429) {
    error.code = 'RATE_LIMIT';
  }

  return error;
}

function getFriendlyApiError(status, errorText = '') {
  if (status === 400) {
    return 'Trip planner could not process this request. Please check the input details.';
  }

  if (status === 401 || status === 403) {
    return 'Trip planner access was denied. Please verify the Gemini API key, project permissions, and API key restrictions.';
  }

  if (status === 404 && errorText.includes('models/gemini')) {
    return 'No supported travel planning model is available for this API key. Please check the API key project settings.';
  }

  if (status === 429) {
    return 'Trip planner is busy right now. Please wait a moment and try again.';
  }

  return 'Trip planner is not available right now. Please try again shortly.';
}
