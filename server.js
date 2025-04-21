const express = require("express");
const fs = require("fs");
const axios = require("axios");
const cron = require("node-cron");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

const DATA_FILE = path.join(__dirname, "location.json");
let weatherData = { precipitate: null };

// Ensure the data file exists
function ensureDataFileExists() {
  if (!fs.existsSync(DATA_FILE)) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ city: "", lat: "", lon: "" }));
      console.log("Created empty location data file");
    } catch (error) {
      console.error("Failed to create data file:", error);
    }
  }
}

// Save selected location
app.post("/set-location", (req, res) => {
  const { city, lat, lon } = req.body;
  console.log("Received location data:", req.body);
  
  if (!city || !lat || !lon) {
    return res.status(400).json({ error: "Missing parameters. Required: city, lat, lon" });
  }

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ city, lat, lon }));
    // Fetch weather immediately after setting a new location
    fetchWeather().then(() => {
      console.log("Weather data updated after new location set");
    });
    res.json({ message: "Location saved successfully" });
  } catch (error) {
    console.error("Error saving location:", error);
    res.status(500).json({ error: "Failed to save location data" });
  }
});

// Fetch weather data from API
async function fetchWeather() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      ensureDataFileExists();
      console.log("No location data found");
      return;
    }
    
    const locationData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    
    if (!locationData.lat || !locationData.lon) {
      console.log("Location data incomplete");
      return;
    }

    console.log(`Fetching weather for ${locationData.city} (${locationData.lat}, ${locationData.lon})`);
    
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${locationData.lat}&longitude=${locationData.lon}&current_weather=true`;
    const response = await axios.get(weatherUrl);
    
    if (!response.data || !response.data.current_weather) {
      console.error("Invalid weather data response");
      return;
    }
    
    const weatherCode = response.data.current_weather.weathercode;
    // Weather codes 51-99 represent precipitation (rain, snow, etc.)
    weatherData.precipitate = (weatherCode >= 51 && weatherCode <= 99) ? 0 : 1;
    weatherData.lastUpdated = new Date().toISOString();
    
    console.log("Updated weather data:", weatherData);
  } catch (error) {
    console.error("Error fetching weather data:", error);
  }
}

// API to check if it will precipitate (original format)
app.get("/will-precipitate", (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE) || fs.readFileSync(DATA_FILE, "utf8").trim() === "") {
      return res.status(400).json({ error: "No location set. Please set a location first." });
    }
    
    const locationData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    
    if (!locationData.lat || !locationData.lon) {
      return res.status(400).json({ error: "Location data is incomplete. Please set a location again." });
    }
    
    // If weather data hasn't been fetched yet
    if (weatherData.precipitate === null) {
      fetchWeather().then(() => {
        console.log("Weather data fetched on demand");
      });
      return res.json({ precipitate: null, message: "Weather data is being updated" });
    }
    
    res.json(weatherData);
  } catch (error) {
    console.error("Error in will-precipitate endpoint:", error);
    res.status(500).json({ error: "Server error fetching precipitation data" });
  }
});

// NEW ENDPOINT - Simple true/false precipitation status
app.get("/precipitation-status", (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE) || fs.readFileSync(DATA_FILE, "utf8").trim() === "") {
      return res.status(400).json({ error: "No location set" });
    }
    
    const locationData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    
    if (!locationData.lat || !locationData.lon) {
      return res.status(400).json({ error: "Incomplete location data" });
    }
    
    // If weather data hasn't been fetched yet, do it now
    if (weatherData.precipitate === null) {
      fetchWeather().then(() => {
        console.log("Weather data fetched on demand");
      });
      return res.json({ precipitating: false, message: "Weather data not available yet" });
    }
    
    // Return a simple boolean response
    res.json({ 
      precipitating: weatherData.precipitate === 1,
      location: locationData.city,
      lastUpdated: weatherData.lastUpdated || null
    });
  } catch (error) {
    console.error("Error in precipitation-status endpoint:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Schedule fetching every 3 hours
cron.schedule("0 */3 * * *", () => {
  console.log("Running scheduled weather update");
  fetchWeather();
});

// Initial weather fetch on server start
ensureDataFileExists();
fetchWeather();

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));