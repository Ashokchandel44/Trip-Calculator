import { useEffect, useState } from 'react';
import { generateTripEstimate } from './services/geminiTripService.js';

const initialForm = {
  startingLocation: '',
  destinationLocation: '',
  travelers: 1,
  travelDate: '',
  returnDate: '',
  durationDays: '',
  budgetLevel: 'standard',
  interests: [],
};

const interestOptions = ['food', 'nature', 'shopping', 'adventure', 'family', 'nightlife', 'culture'];
const budgetLevels = ['economy', 'standard', 'premium'];

export default function App() {
  const [formData, setFormData] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: name === 'travelers' ? Number(value) : value,
    }));

    setErrors((current) => ({ ...current, [name]: '' }));
  }

  function handleInterestToggle(interest) {
    setFormData((current) => {
      const hasInterest = current.interests.includes(interest);

      return {
        ...current,
        interests: hasInterest
          ? current.interests.filter((item) => item !== interest)
          : [...current.interests, interest],
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setCopyMessage('');
    setStatusMessage('');

    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length) {
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const estimate = await generateTripEstimate(formData);
      setResult(estimate);
    } catch (error) {
      setStatusMessage(error.message || 'Unable to calculate this trip right now.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setFormData(initialForm);
    setResult(null);
    setErrors({});
    setStatusMessage('');
    setCopyMessage('');
  }

  async function handleCopyResult() {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(formatResultForCopy(result));
      setCopyMessage('Trip result copied.');
    } catch {
      setCopyMessage('Copy failed. You can still select and copy the result manually.');
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="site-shell"> 
      <header className="site-nav">
        <a className="site-logo" href="https://travelwithanki.com/" target="_blank" aria-label="TravelwithAnki Trip Calculator">
          <LogoText />
          <span className="logo-subtitle">Smart trip budget tool</span>
        </a>
        <nav aria-label="Trip calculator sections">
          <span className="nav-pill">No Upload</span>
          <span className="nav-pill">Browser Only</span>
          <span className="nav-pill">Travel Ready</span>
          <a href="#calculator">Calculator</a>
          <a href="#results">Costs</a>
          <a href="#hotels">Hotels</a>
        </nav>
      </header>

      <main className="app-shell" id="top">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">Smart Travel Budget Tool</p>
            <h1>Trip Calculator for your next journey</h1>
            <p className="brand-line">
              Plan faster with <span className="script">TravelWithAnki</span>
            </p>
            <p className="subtitle">
              Estimate route distance, private car, taxi, bike, bus, hotel, food, route stops,
              and booking links in one simple travel planner.
            </p>
            <div className="hero-points" aria-label="Trip calculator highlights">
              <span>Route cost</span>
              <span>Hotel links</span>
              <span>Road stops</span>
            </div>
            <a className="hero-cta" href="#calculator">Start planning</a>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="route-card">
              <span>Any route</span>
              <strong>From your city to your destination</strong>
              <p>Distance, road cost, taxi, bike, bus, hotels and route ideas</p>
            </div>
          </div>
        </section>

        <section className="workspace" id="calculator">
        <form className="card trip-form" onSubmit={handleSubmit}>
          <div className="section-heading">
            <span>Plan your trip</span>
            <p>Fill only the basic details. The estimate appears on the right.</p>
          </div>

          <div className="form-grid">
            <Field
              label="From"
              name="startingLocation"
              value={formData.startingLocation}
              onChange={handleChange}
              error={errors.startingLocation}
              placeholder="Delhi, India"
            />
            <Field
              label="To"
              name="destinationLocation"
              value={formData.destinationLocation}
              onChange={handleChange}
              error={errors.destinationLocation}
              placeholder="Destination city"
            />
            <Field
              label="Travelers"
              name="travelers"
              type="number"
              min="1"
              value={formData.travelers}
              onChange={handleChange}
              error={errors.travelers}
            />
            <Field
              label="Start date"
              name="travelDate"
              type="date"
              value={formData.travelDate}
              onChange={handleChange}
              error={errors.travelDate}
            />
            <Field
              label="Return date"
              name="returnDate"
              type="date"
              value={formData.returnDate}
              onChange={handleChange}
              error={errors.returnDate}
            />
            <Field
              label="Days"
              name="durationDays"
              type="number"
              min="1"
              value={formData.durationDays}
              onChange={handleChange}
              error={errors.durationDays}
              placeholder="Example: 3"
            />
          </div>

          <div className="control-row compact-row">
            <SegmentedControl
              label="Budget"
              name="budgetLevel"
              options={budgetLevels}
              value={formData.budgetLevel}
              onChange={handleChange}
            />
          </div>

          <div className="interest-section">
            <span className="control-label">What do you like?</span>
            <div className="interest-grid">
              {interestOptions.map((interest) => (
                <label className="interest-badge" key={interest}>
                  <input
                    type="checkbox"
                    checked={formData.interests.includes(interest)}
                    onChange={() => handleInterestToggle(interest)}
                  />
                  <span>{capitalize(interest)}</span>
                </label>
              ))}
            </div>
          </div>

          {statusMessage && <div className="message error">{statusMessage}</div>}

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Preparing plan...' : 'Calculate Trip'}
            </button>
            <button className="secondary-button" type="button" onClick={handleReset} disabled={isLoading}>
              Reset
            </button>
          </div>
        </form>

        <ResultPanel
          result={result}
          isLoading={isLoading}
          copyMessage={copyMessage}
          onCopy={handleCopyResult}
          onPrint={handlePrint}
        />
      </section>

        <footer className="site-footer">
          <div>
            <LogoText />
            <p>Trip ideas, cost planning, hotel searches, and practical route guidance.</p>
          </div>
          <div className="footer-links">
            <a href="#calculator">Plan trip</a>
            <a href="#results">View estimate</a>
            <a href="https://travelwithanki.com" target="_blank" rel="noreferrer">
              Visit site
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function LogoText() {
  return (
    <span className="brand-logo" aria-label="TravelWithAnki">
      TravelWithAnki
    </span>
  );
}

function Field({ label, error, ...inputProps }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...inputProps} />
      {error && <small>{error}</small>}
    </label>
  );
}

function SegmentedControl({ label, name, options, value, onChange }) {
  return (
    <div className="segmented-wrap">
      <span className="control-label">{label}</span>
      <div className="segmented-control">
        {options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={onChange}
            />
            <span>{capitalize(option)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ResultPanel({ result, isLoading, copyMessage, onCopy, onPrint }) {
  const [activeTransport, setActiveTransport] = useState('privateCar');
  const [showAccessInfo, setShowAccessInfo] = useState(false);
  const [pdfMessage, setPdfMessage] = useState('');

  useEffect(() => {
    setActiveTransport('privateCar');
    setShowAccessInfo(false);
    setPdfMessage('');
  }, [result]);

  if (isLoading) {
    return (
      <section className="card result-panel loading-card">
        <div className="loader" />
        <h2>TravelwithAnki is preparing your trip estimate</h2>
        <p>Preparing distance, travel cost, hotel ideas, route stops, and tips.</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="card result-panel empty-state">
        <h2>Your trip summary will appear here</h2>
        <p>Add route details and calculate to see the budget, route stops, and hotel options.</p>
      </section>
    );
  }

  const transportOptions = result.transportOptions || {};
  const selectedTransport = transportOptions[activeTransport] || transportOptions.privateCar || {};
  const selectedTotal = result.totalByTransport?.[activeTransport] || result.totalBudget;

  return (
    <section className="result-panel print-area" id="results">
      <div className="card summary-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">Your Estimate</p>
            <h2>
              {result.route.from} to {result.route.to}
            </h2>
          </div>
          <span className="mode-badge">{selectedTransport.label || result.suggestedTravelMode}</span>
        </div>

        <div className="metric-grid">
          <Metric label="Estimated distance" value={result.estimatedDistance} />
          <Metric label="Estimated travel time" value={result.estimatedTravelTime} />
          <Metric label="Travel option cost" value={selectedTransport.total || result.transportCost} />
          <Metric label="Stay cost" value={result.accommodationCost} />
          <Metric label="Food cost" value={result.foodCost} />
          <Metric label="Total budget" value={selectedTotal} featured />
        </div>

        <div className="transport-card no-print">
          <div className="transport-card-title">
            <span>Choose travel option</span>
            <strong>{selectedTransport.status || 'Estimated option'}</strong>
          </div>
          <div className="transport-tabs" aria-label="Transport estimate options">
            {Object.entries(transportOptions).map(([key, option]) => (
              <button
                className={activeTransport === key ? 'active' : ''}
                key={key}
                type="button"
                onClick={() => {
                  setActiveTransport(key);
                  setShowAccessInfo(false);
                  setPdfMessage('');
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {selectedTransport.label && (
            <div className="transport-detail">
              <strong>{selectedTransport.total}</strong>
              <span>{selectedTransport.note}</span>
              <ul>
                {(selectedTransport.breakdown || []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              {selectedTransport.accessInfo && (
                <button
                  className="check-button"
                  type="button"
                  onClick={() => setShowAccessInfo((current) => !current)}
                >
                  {showAccessInfo ? 'Hide details' : 'Check details'}
                </button>
              )}
            </div>
          )}

          {showAccessInfo && selectedTransport.accessInfo && (
            <div className="access-info-panel">
              <span>{selectedTransport.accessInfo.title}</span>
              <div className="access-pair">
                <div>
                  <small>From: {selectedTransport.accessInfo.originLabel}</small>
                  <strong>{selectedTransport.accessInfo.originNearest}</strong>
                </div>
                <div>
                  <small>To: {selectedTransport.accessInfo.destinationLabel}</small>
                  <strong>{selectedTransport.accessInfo.destinationNearest}</strong>
                </div>
              </div>
              <p>{selectedTransport.accessInfo.available}</p>
              <p>{selectedTransport.accessInfo.transfer}</p>
              <em>{selectedTransport.accessInfo.tip}</em>
            </div>
          )}
        </div>

        <div className="info-band">
          <span>Best time to travel</span>
          <strong>{result.bestTimeToTravel}</strong>
        </div>

        <div className="action-row no-print">
          <button className="secondary-button" type="button" onClick={onCopy}>
            Copy result
          </button>
          <button className="secondary-button" type="button" onClick={onPrint}>
            Print
          </button>
          <button
            className="secondary-button" type="button"
            onClick={() => downloadPdf({ result, selectedTransport, selectedTotal, setPdfMessage })}
          >
            Download PDF
          </button>
        </div>
        {copyMessage && <p className="copy-message no-print">{copyMessage}</p>}
        {pdfMessage && <p className="copy-message no-print">{pdfMessage}</p>}
      </div>

      <div className="result-grid">
        <ListCard title="5 useful travel tips" items={result.travelTips} />
        <RouteStopsCard items={result.routeHighlights} />
        <HotelLinksCard links={result.hotelLinks} destination={result.route.to} />
        <ItineraryCard items={result.miniItinerary} />
        <ListCard title="Things to avoid" items={result.thingsToAvoid} />
        <ListCard title="Packing suggestions" items={result.packingSuggestions} />
        <ListCard title="Estimate assumptions" items={result.assumptions} />
      </div>
    </section>
  );
}

async function downloadPdf({ result, selectedTransport, selectedTotal, setPdfMessage }) {
  try {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 42;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const maxWidth = pageWidth - margin * 2;
    let y = 46;

    const write = (text, size = 11, isBold = false) => {
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
      pdf.setFontSize(size);
      const lines = pdf.splitTextToSize(String(text), maxWidth);
      lines.forEach((line) => {
        if (y > 780) {
          pdf.addPage();
          y = 46;
        }
        pdf.text(line, margin, y);
        y += size + 7;
      });
    };

    write('TravelWithAnki Trip Calculator', 18, true);
    write(`${result.route.from} to ${result.route.to}`, 15, true);
    write(`Distance: ${result.estimatedDistance}`);
    write(`Travel time: ${result.estimatedTravelTime}`);
    write(`Selected travel option: ${selectedTransport.label}`);
    write(`Travel option cost: ${selectedTransport.total}`);
    write(`Stay cost: ${result.accommodationCost}`);
    write(`Food cost: ${result.foodCost}`);
    write(`Total budget: ${selectedTotal}`, 13, true);
    write(`Best time: ${result.bestTimeToTravel}`);

    write('\nTravel options', 14, true);
    Object.values(result.transportOptions || {}).forEach((option) => {
      write(`${option.label}: ${option.total} - ${option.note}`);
    });

    write('\nPlaces to see on the way', 14, true);
    (result.routeHighlights || []).forEach((place) => {
      write(`${place.name}: ${place.description}`);
    });

    write('\nTravel tips', 14, true);
    (result.travelTips || []).forEach((tip) => write(`- ${tip}`));

    pdf.save(`travelwithanki-${slugify(result.route.from)}-to-${slugify(result.route.to)}.pdf`);
    setPdfMessage('PDF downloaded.');
  } catch {
    setPdfMessage('PDF download failed. Please try Print and choose Save as PDF.');
  }
}

function slugify(value) {
  return String(value || 'trip')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function RouteStopsCard({ items }) {
  return (
    <article className="card detail-card">
      <h3>Places to see on the way</h3>
      {items.length ? (
        <div className="place-list">
          {items.map((item, index) => (
            <div className="place-item" key={`${item.name}-${index}`}>
              <strong>{item.name}</strong>
              <p>{item.description}</p>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(item.name)}`}
                target="_blank"
                rel="noreferrer"
              >
                View details
              </a>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No route stops returned.</p>
      )}
    </article>
  );
}

function HotelLinksCard({ links, destination }) {
  return (
    <article className="card detail-card booking-card" id="hotels">
      <h3>Book hotels in {destination}</h3>
      <p className="muted">Compare prices before booking. These links open hotel searches.</p>
      <div className="booking-links">
        {links.map((link) => (
          <a href={link.url} key={link.label} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </div>
    </article>
  );
}

function Metric({ label, value, featured = false }) {
  return (
    <div className={`metric ${featured ? 'featured' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ListCard({ title, items }) {
  return (
    <article className="card detail-card">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No details returned for this section.</p>
      )}
    </article>
  );
}

function ItineraryCard({ items }) {
  return (
    <article className="card detail-card">
      <h3>Suggested mini itinerary</h3>
      {items.length ? (
        <div className="itinerary-list">
          {items.map((item, index) => (
            <div className="itinerary-item" key={`${item.day || 'day'}-${index}`}>
              <span>{item.day || `Day ${index + 1}`}</span>
              <p>{item.plan || item}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No itinerary returned.</p>
      )}
    </article>
  );
}

function validateForm(data) {
  const nextErrors = {};

  if (!data.startingLocation.trim()) {
    nextErrors.startingLocation = 'Starting location is required.';
  }

  if (!data.destinationLocation.trim()) {
    nextErrors.destinationLocation = 'Destination location is required.';
  }

  if (!Number.isFinite(Number(data.travelers)) || Number(data.travelers) < 1) {
    nextErrors.travelers = 'Enter at least 1 traveler.';
  }

  if (!data.travelDate) {
    nextErrors.travelDate = 'Travel date is required.';
  }

  if (!data.returnDate && !data.durationDays) {
    nextErrors.durationDays = 'Add return date or trip duration.';
  }

  if (data.returnDate && data.travelDate && data.returnDate < data.travelDate) {
    nextErrors.returnDate = 'Return date cannot be before travel date.';
  }

  if (data.durationDays && Number(data.durationDays) < 1) {
    nextErrors.durationDays = 'Duration must be at least 1 day.';
  }

  return nextErrors;
}

function formatResultForCopy(result) {
  const list = (items) => items.map((item) => `- ${typeof item === 'string' ? item : `${item.day}: ${item.plan}`}`).join('\n');

  return `
Trip: ${result.route.from} to ${result.route.to}
Distance: ${result.estimatedDistance}
Travel time: ${result.estimatedTravelTime}
Suggested mode: ${result.suggestedTravelMode}
Transport cost: ${result.transportCost}
Travel options:
${Object.values(result.transportOptions || {}).map((option) => `- ${option.label}: ${option.total} (${option.note})`).join('\n')}
Accommodation cost: ${result.accommodationCost}
Food cost: ${result.foodCost}
Total budget: ${result.totalBudget}
Best time to travel: ${result.bestTimeToTravel}

Travel tips:
${list(result.travelTips)}

Mini itinerary:
${list(result.miniItinerary)}

Things to avoid:
${list(result.thingsToAvoid)}

Packing suggestions:
${list(result.packingSuggestions)}

Hotel search:
${(result.hotelLinks || []).map((link) => `- ${link.label}: ${link.url}`).join('\n')}
`.trim();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
