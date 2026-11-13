import { ArrowUpRight } from 'lucide-react';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <div className="footer-word">ODYSSEY</div>
            <div className="footer-tag">YOUR NEXT MISSION STARTS ON EARTH.</div>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <div className="h">Explore</div>
              <a href="#problem">The problem</a>
              <a href="#planner">Mission brief</a>
              <a href="#scan">Global scan</a>
              <a href="#weightlab">Weight lab</a>
              <a href="#campaign">Campaign</a>
              <a href="#validation">Validation</a>
            </div>
            <div className="footer-col">
              <div className="h">Data</div>
              <span>NASA POWER</span>
              <span>NASA GIBS / MODIS</span>
              <span>Open-Meteo</span>
              <span>NASA PDS</span>
              <span>USGS / Copernicus</span>
            </div>
            <div className="footer-col">
              <div className="h">Project</div>
              <span>NASA Space Apps 2026</span>
              <span>Challenge: Earth analogs</span>
              <span>Concept prototype</span>
              <a href="#top">Back to top <ArrowUpRight size={11} style={{ verticalAlign: -1 }} /></a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="mono">ODYSSEY / PLANETARY ANALOG MISSION PLANNER / 2026</div>
          <div className="mono">DATA: NASA POWER · NASA GIBS · OPEN-METEO · NASA PDS</div>
          <div className="mono">CONCEPT PROTOTYPE / NOT AN OFFICIAL NASA PRODUCT</div>
        </div>
      </div>
    </footer>
  );
}
