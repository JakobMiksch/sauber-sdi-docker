/*
 * Script to init the GeoServer within the SAUBER SDI.
 *
 * @author C. Mayer, meggsimum
 */
import GeoServerRestClient from 'geoserver-node-client';
import {framedBigLogging, framedMediumLogging} from './js-utils/logging.js';
import dockerSecret from './js-utils/docker-secrets.js';

const verbose = process.env.GSINIT_VERBOSE;

const geoserverUrl = process.env.GSPUB_GS_REST_URL || 'http://geoserver:8080/geoserver/rest/';
const geoserverDefaultUser = process.env.GSINIT_GS_REST_DEFAULT_USER || 'admin';
const geoserverDefaultPw = process.env.GSINIT_GS_REST_DEFAULT_PW || 'geoserver';

verboseLogging('GeoServer REST URL: ', geoserverUrl);
verboseLogging('GeoServer Default REST User:', geoserverDefaultUser);
verboseLogging('GeoServer Default REST PW:  ', geoserverDefaultPw);

const workspacesList = process.env.GSINIT_WS || 'station_data,image_mosaics';
const stationWorkspace = process.env.GSINIT_STATION_WS || 'station_data';
const stationDataStore = process.env.GSINIT_STATION_DS || 'station_data';
const pgHost = process.env.GSINIT_PG_HOST || 'db';
const pgPort = process.env.GSINIT_PG_PORT || '5432';
const pgUser = process.env.GSINIT_PG_USER || 'app';
const pgPassword = dockerSecret.read('app_password') || process.env.GSINIT_PG_PW;
const pgSchema = process.env.GSINIT_PG_SCHEMA || 'station_data';
const pgDb = process.env.GSINIT_PG_DB || 'sauber_data';
const newGeoserverUser = dockerSecret.read('geoserver_user');
const newGeoserverPw = dockerSecret.read('geoserver_password');
const role = 'ADMIN';

verboseLogging('-----------------------------------------------');

verboseLogging('Workspaces:  ', workspacesList);
verboseLogging('Station WS:  ', stationWorkspace);
verboseLogging('Station DS:  ', stationDataStore);
verboseLogging('PG Host:     ', pgHost);
verboseLogging('PG Port:     ', pgPort);
verboseLogging('PG User:     ', pgUser);
verboseLogging('PG Schema:   ', pgSchema);
verboseLogging('PG Database: ', pgDb);

/**
 * Main process:
 *  - Create workspaces
 *  - Change user + password
 *  - Create store and layer for stations
 */
async function initGeoserver() {
  framedBigLogging('Start initalizing SAUBER GeoServer...');

  await adaptSecurity();

  await createWorkspaces();

  await createPostgisDatastore();

  framedBigLogging('... DONE initalizing SAUBER GeoServer');
}

/**
 * Adapts security settings for GeoServer
 */
async function adaptSecurity() {
  const user = newGeoserverUser;
  const userPw = newGeoserverPw;

  if (!user || !userPw || user === '' || userPw === '') {
    exitWithErrMsg('No valid user or user password given - EXIT.');
  }

  const userCreated =  await grc.security.createUser(user, userPw);
  if (userCreated) {
    console.info('Successfully created user', user);
  }

  const roleAssigend = await grc.security.associateUserRole(user, role);
  if (roleAssigend) {
    console.info(`Successfully added role ${role} to user ${user}`);
  }

  // disable default admin user
  const adminDisabled = await grc.security.updateUser(geoserverDefaultUser, geoserverDefaultPw, false);
  if (adminDisabled) {
    console.info('Successfully disabled default "admin" user');
  }
}

/**
 * Creates the desired project workspaces.
 */
async function createWorkspaces() {
  framedMediumLogging('Creating workspaces...');

  console.info('Configuring the workspaces ', workspacesList);

  const workspaces = workspacesList.split(',');
  await asyncForEach(workspaces, async ws => {
    const wsCreated = await grc.workspaces.create(ws);
    if (wsCreated) {
      console.info('Successfully created workspace', wsCreated);
    }
  });
}

/**
 * Creates a DataStore for our PostGIS database.
 */
async function createPostgisDatastore() {
  framedMediumLogging('Creating PostGIS data store...');

  const success = await grc.datastores.createPostgisStore(
    stationWorkspace, stationDataStore, pgHost, pgPort, pgUser, pgPassword,
    pgSchema, pgDb
  );

  if (success) {
    console.info('Successfully created PostGIS store');
  }
}

/**
 * Creates the station layer.
 */
async function createStationsLayer() {
  framedMediumLogging('Creating stations layer...');

  const workspace = 'station_data';
  const dataStore = 'station_data';
  const stationLayerName = 'fv_stations';
  const srs = 'EPSG:3035';

  const success = await grc.layers.publishFeatureType(workspace, dataStore, stationLayerName, stationLayerName, stationLayerName, srs);

  if (success) {
    console.info('Successfully created stations layer ', stationLayerName);
  }
}

/**
 * Helper to perform asynchronous forEach.
 * Found at https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404
 *
 * @param {*[]} array
 * @param {Function} callback
 */
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

/**
 * Exits script and logs an error message.
 *
 * @param {String} msg The error message to log before exiting
 */
function exitWithErrMsg(msg) {
  framedMediumLogging(msg);
  process.exit(1);
}

function verboseLogging(msg) {
  if (verbose) {
    console.log.apply(console, arguments);
  }
}

// check if we can connect to GeoServer REST API
const grc = new GeoServerRestClient(geoserverUrl, geoserverDefaultUser, geoserverDefaultPw);
grc.exists().then(gsExists => {
  if (gsExists === true) {
    // start publishing process
    initGeoserver();
  } else {
    exitWithErrMsg('Could not connect to GeoServer REST API - ABORT!');
  }
});
