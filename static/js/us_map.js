// defines svg parameters and legend text format
const w = 1200;
const h = 700;
const padding = 50;
const popFormat = d3.format('.3s')
const links = []
const topAirports = ['IAH', 'LGA', 'ORD']

// create svg element
const svg = d3.select('body')
  .append('svg')
  .attr('class', 'map')
  .attr('width', w)
  .attr('height', h);

// create projection which adjusts size and location of map
const projection = d3.geo.albersUsa()
  .translate([w/2, h/2])
  .scale([1400])

// Color scale with risk
const colorScale = d3.scale.linear()
  .domain([0, 100])
  .range([colorbrewer.YlOrBr[9][4], colorbrewer.YlOrBr[9][8]]);

// State colors
const stateColor = d3.scale.linear()
   .domain([0, 47])
   .range([colorbrewer.YlGn[9][3], colorbrewer.YlGn[9][5]]);

// create path element to draw state borders and queues
const path = d3.geo.path().projection(projection);
const q = d3.queue();

// Define and set min, val, max of date input
const today = new Date();
const mm = ('0' + (today.getMonth() + 1)).slice(-2)
const dd = ('0' + today.getDate()).slice(-2)
const yyyymmdd = today.getFullYear() + '-' + mm + '-' + dd

// Set date 1 week from today
today.setDate(today.getDate() + 7)
const mm7 = ('0' + (today.getMonth() + 1)).slice(-2)
const dd7 = ('0' + today.getDate()).slice(-2)
const yyyymmdd7 = today.getFullYear() + '-' + mm7 + '-' + dd7

// Set date 10 days from today
today.setDate(today.getDate() + 3)
const mm10 = ('0' + (today.getMonth() + 1)).slice(-2)
const dd10 = ('0' + today.getDate()).slice(-2)
const yyyymmdd10 = today.getFullYear() + '-' + mm10 + '-' + dd10

// Add min, max, and value properties of the date input
d3.select('#date')
  .property('min', yyyymmdd)
  .property('value', yyyymmdd7)
  .property('max', yyyymmdd10)

// Queue and load the below mentioned files
q.defer(d3.csv, './static/AirLines.asp')
  .defer(d3.csv, './static/flight_times.asp')
  .defer(d3.csv, './static/us_city_attributes.asp')
  .defer(d3.json, './static/state.geo.json')
  .await((error, airlines, flight_times, cities, states) => {

    // Remove Hawaii and Alaska
    const state_feats = states.features.filter(state =>{
      const name = state.properties.NAME10
      return name !== 'Alaska' && name !== 'Hawaii'
    })

    // Sort cities
    cities = cities.sort((a, b) => {
      var textA = a.Code.toUpperCase();
      var textB = b.Code.toUpperCase();
      return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
    });

    // Create Object of all possible flight paths with src and tgt details
    for(let i = 0; i < cities.length; i++){
      for(let j = 0; j < cities.length; j++){
        if(j===i) continue
        let link = {
          'Source': {
            'City': cities[i].City,
            'Code': cities[i].Code,
            'Code2': cities[i].Code2,
            'Longitude': cities[i].Longitude,
            'Latitude': cities[i].Latitude
          },
          'Target': {
            'City': cities[j].City,
            'Code': cities[j].Code,
            'Code2': cities[j].Code2,
            'Longitude': cities[j].Longitude,
            'Latitude': cities[j].Latitude
          },
          'TravelTime': +flight_times.filter(t => t.Dep === cities[i].Code && t.Arr === cities[j].Code)[0].Time,
          'Risk': Math.round(Math.random()*100)
        }
        links.push(link)
      }
    }

    // Add airlines to dropdown menu
    airlines.forEach(airline => {
      d3.select('#airline')
        .append('option')
        .text(airline.Description + ' (' + airline.Code + ')')
    })

    // Depart and arrive airport dropdown boxes
    const dd_boxes = d3.selectAll('#dep, #arr').selectAll('option')
      .data(cities).enter()

    // Set default to blank and append option
    d3.select('#dep').append('option')
      .property('selected', 'selected')
    d3.select('#arr').append('option')
      .property('selected', 'selected')
    dd_boxes.append('option')
      .text(d => d.Code)

    // Define input even listeners
    d3.selectAll('input, select').on('input', dep_arr)
    d3.selectAll('select').on('input', () => {
      remPinnedCities()
      dep_arr()
    })
    d3.select('#risk').on('input', filter)
    d3.select('#slideLab')
      .text(d3.select('#risk').property('value') + '%')

    // draw the Choropleth map, fill with color scale, and show / hide
    svg.append('g')
      .selectAll('path')
      .attr('class', 'states')
    .data(state_feats).enter()
      .append('path')
      .attr('d', path)
      .attr('class', 'state')
      .attr('fill', (d, i) => stateColor(i) )
      .attr('transform', 'translate(0,0)')

    // Create city elements
    const city = svg.selectAll('.ctiy')
      .data(cities).enter()

    // Append circles to city locations
    city.append('circle')
      .attr('r', 5)
      .attr('class', 'city')
      .attr('id', d => d.Code)
      .attr('transform', d => 'translate(' + projection([d.Longitude, d.Latitude]) + ')')
      .on('click', showPath)

    // Add airport code labels to city locations
    city.append('text')
      .attr('class', 'city')
      .attr('transform', d => 'translate(' + projection([d.Longitude, d.Latitude]) + ')')
      .attr('dx', -10)
      .attr('text-anchor', 'end')
      .attr('dy', d => topAirports.indexOf(d.Code) > -1? -15:0)
      .text(d =>  d.Code);

    // city name tool tip on mouseover
    const tip = d3.tip()
      .attr('class', 'd3-tip')
      .html(d => {
        if(d.class == 'clicked') return '<strong>Unpin '+ d.City +'</strong>'
        return '<strong>Pin '+ d.City +'</strong>'
      });

    // Flight path details tool tip on mouseover
    const pathtip = d3.tip()
      .attr('class', 'd3-tip')
      .html(d => {
        let tipString = '<strong class="category">'
          + d.data[0].Source.Code + ' to ' + d.data[0].Target.Code +
          ': </strong>' + Math.round(d.data[0].Risk, 0) + '% <br>'
        if(d.data[1]) tipString += '<strong class="category">'
          + d.data[1].Source.Code + ' to ' + d.data[1].Target.Code +
          ': </strong>' + Math.round(d.data[1].Risk, 0) + '% <br>'
        if(d.dataOther){
          tipString += '<strong class="category">'
            + d.dataOther[0].Source.Code + ' to ' + d.dataOther[0].Target.Code +
            ': </strong>' + Math.round(d.dataOther[0].Risk, 0) + '% <br>'
          if(d.dataOther[1]) tipString += '<strong class="category">'
            + d.dataOther[1].Source.Code + ' to ' + d.dataOther[1].Target.Code +
            ': </strong>' + Math.round(d.dataOther[1].Risk, 0) + '% <br>'
        }
        return tipString
      });

    // call tool tips
    svg.call(tip);
    svg.call(pathtip);

    // Create marker, flight path elements, input values
    const defs = svg.append('svg:defs');
    const flightPath = svg.selectAll('.flightpath')
    const sliderNum = d3.select('#time').property('value')
    const timeText = (sliderNum % 12 === 0? 12:sliderNum % 12) + (sliderNum < 12? ':00 AM':':00 PM')
    const layover = d3.select('#layover').property('value')

    /**
    * @name dep_arr
    * @description Creates all flight paths
    */
    function dep_arr(){
      // Remove all flightpaths and text and return cities to normal size
      d3.selectAll('.flightpath').remove()
      d3.selectAll('.pathText').remove()
      d3.selectAll('.selected')
        .attr('class', 'city')
        .attr('r', 5)

      // Gather and modify all user input
      const depCode = d3.select('#dep').property('value');
      const arrCode = d3.select('#arr').property('value');
      const date = d3.select('#date').property('value').split('-');
      const time = d3.select('#time').property('value');
      const layover = d3.select('#layover').property('value')
      const airline = d3.select('#airline').property('value').match(/\(([\S\s]*?)\)/)[1];
      const timezoneDep = d3.select('circle#' + depCode).data()[0].TimeZone

        // Perform changes only if city is different
        if(arrCode !== depCode){
          // Define a circle connecting depart and arrive airports
          const dirLink = links.find(link => link.Source.Code === depCode && link.Target.Code === arrCode)
          const proj_dep = projection([dirLink.Source.Longitude, dirLink.Source.Latitude])
          const proj_arr = projection([dirLink.Target.Longitude, dirLink.Target.Latitude])
          const dirxc = (proj_arr[0] + proj_dep[0]) / 2
          const diryc = (proj_arr[1] + proj_dep[1]) / 2
          const dirdx = proj_arr[0] - proj_dep[0]
          const dirdy = proj_arr[1] - proj_dep[1]
          const radius = Math.sqrt(dirdx ** 2 + dirdy ** 2) / 2 + 1
          const flights = []

          // Loop through all possible flight combinations (links) and push
          // to flights
          for(let i = 0; i < links.length; i++){
            if(links[i].TravelTime == 0) continue
            let proj_src = projection([links[i].Source.Longitude, links[i].Source.Latitude])
            let proj_tgt = projection([links[i].Target.Longitude, links[i].Target.Latitude])

            // Ensure both flight legs have flight times
            if(depCode === links[i].Source.Code){
              if(links[i].Target.Code != arrCode){
                let otherTime = links.filter(t => {return t.Source.Code === links[i].Target.Code && t.Target.Code === arrCode})[0].TravelTime
                if(otherTime == 0) continue
              }

              // Append flights with flights within radius and flight times != 0
              let dx = proj_tgt[0] - dirxc
              let dy = proj_tgt[1] - diryc
              let dist = Math.sqrt(dx ** 2 + dy ** 2)
              if(radius > dist) flights.push(links[i])
            }

            // Ensure both flight legs have flight times
            if(arrCode === links[i].Target.Code){
              if(links[i].Source.Code != depCode){
                let otherTime = links.filter(t => t.Target.Code === links[i].Source.Code && t.Source.Code === depCode)[0].TravelTime
                if(otherTime == 0) continue
              }

              // Append flights with flights within radius and flight times != 0
              let dx = proj_src[0] - dirxc
              let dy = proj_src[1] - diryc
              let dist = Math.sqrt(dx ** 2 + dy ** 2)
              if(depCode !== links[i].Source.Code && radius > dist) flights.push(links[i])
            }
          }

          // Create UTC time
          const utcDateTime = new Date(date[1] + ' ' + date[2] + ' ' + date[0] + ' ' + time + ':00 ' + timezoneDep)
          const mm = ('0' + (utcDateTime.getUTCMonth() + 1)).slice(-2)
          const dd = ('0' + utcDateTime.getUTCDate()).slice(-2)
          const yyyymmdd = utcDateTime.getUTCFullYear() + '-' + mm + '-' + dd

          // Generate Request data
          const flightPaths = flights.map(flight => {
            // Dep time and Arr time generated when leaving from dep
            const depTime = new Date(utcDateTime)
            const arrTime = new Date(utcDateTime)
            arrTime.setMinutes(arrTime.getUTCMinutes() + flight.TravelTime)

            // Dep and Arr time generated when leaving layover
            if(flight.Target.Code == arrCode && flight.Source.Code != depCode){
              const firstLegTime = flights.filter(t => t.Source.Code === depCode && t.Target.Code === flight.Source.Code)[0].TravelTime
              depTime.setMinutes(depTime.getUTCMinutes() + firstLegTime + layover * 60)
              arrTime.setMinutes(arrTime.getUTCMinutes() + firstLegTime + layover * 60)
            }

            // Return Request object
            return {
              'Source': {
                'City': flight.Source.City.replace(/[\s]/g,'_'),
                'Carrier': airline,
                'Airport': flight.Source.Code2,
                'Sched_Dep_Time': depTime
              },
              'Target': {
                'City': flight.Target.City.replace(/[\s]/g,'_'),
                'Carrier': airline,
                'Airport': flight.Target.Code2,
                'Sched_Arr_Time': arrTime
              }
            }
          })

          // Assign flightdata to params
          const params = {
            'Flights': flightPaths,
          }

          // Make request to backend and append completed data with risk
          $.ajax({
            url: 'http://localhost:4000/predict',
            data: JSON.stringify(params),
            type: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            success: function(response){

              // Update Risk with backend response
              flights.forEach(x => {
                x.Risk = response[x.Source.Code2 + '-' + x.Target.Code2] * 100
              })

              // Get slider input
              const slider = d3.select('#risk').property('value')

              // Show selected dep and arr cities
              d3.select('#' + depCode)
               .attr('class', 'selected')
               .attr('r', 10)
              d3.select('#' + arrCode)
               .attr('class', 'selected')
               .attr('r', 10)

              // Create path elements for flightpaths
              flightPath.data(flights).enter()
                .append('svg:path')
                .attr('fill', 'none')
                .attr('class', 'flightpath')
                .attr('id', d => {
                  return (arrCode === d.Target.Code)
                    ? ((depCode === d.Source.Code)
                      ? d.Target.Code
                      : d.Source.Code)
                    : d.Target.Code
                })
                .attr('stroke-width', 2)
                .attr('stroke', d => colorScale(d.Risk))
                .attr('d', d => {
                  const proj_src = projection([d.Source.Longitude, d.Source.Latitude])
                  const proj_tgt = projection([d.Target.Longitude, d.Target.Latitude])
                  const dx = proj_tgt[0] - proj_src[0]
                  const dy = proj_tgt[1] - proj_src[1]
                  const dr = Math.sqrt(dx * dx + dy * dy);
                  const x0 = proj_src[0]
                  const y0 = proj_src[1]
                  return 'M' + x0 + ',' + y0 + 'A' + dr + ',' + dr + ' 0 0,1 ' + proj_tgt[0] + ',' + proj_tgt[1];
                })
                .each(markerColor)
                .on('mouseover', fpMouseOver)
                .on('mouseout', fpMouseOut)

              // Assess the risk of each flight path and display risk text
              d3.selectAll('.flightpath')
               .each(d =>  {
                 // Determine which leg of flight this is
                 const connect = (arrCode === d.Target.Code)
                   ? ((depCode === d.Source.Code)
                     ? d.Target.Code
                     : d.Source.Code)
                   : d.Target.Code

                 // Collect all paths and cities for layover
                 const route = d3.selectAll('#' + connect).filter('.flightpath')
                 const city = d3.selectAll('#' + connect).filter('.city')

                 // Calculate total route risk
                 let data = route.data()
                 let risk = data[0].Risk
                 for(let i = 1; i < data.length; i++) risk = 100 - (100-risk) * (1 - data[i].Risk / 100)
                 risk = Math.round(risk)

                 // Get data from correct layover city
                 const LOdata = (data[0].Target.Code === arrCode && data.length > 1)
                  ? data[1]
                  :data[0]

                  // Check if another airport overlaps layover
                  let other = ''
                  if(connect === 'IAH') other = 'HOU'
                  if(connect === 'ORD') other = 'MDW'
                  if(connect === 'LGA') other = 'JFK'

                 // Eligible layover cities to show tool tip
                 city.attr('class', 'layover')
                   .on('mouseover', showDeets)
                   .on('mouseout', hideDeets)

                 // Eligible overlapping layover cities to show tool tip
                 if(other){
                   d3.selectAll('#' + other)
                     .filter('.city')
                     .attr('class', 'layover')
                     .on('mouseover', showDeets)
                     .on('mouseout', hideDeets)
                 }

                 // Add risk probability to layover city
                 svg.append('text')
                   .attr('class', 'pathText')
                   .attr('id', connect)
                   .attr('transform', () =>{
                     const proj_tgt = projection([LOdata.Target.Longitude, LOdata.Target.Latitude])
                     return 'translate('+(proj_tgt[0])+','+(proj_tgt[1])+')'
                   })
                   .attr('fill', colorScale(risk))
                   .attr('dx', 10)
                   .attr('dy', () => topAirports.indexOf(LOdata.Target.Code) > -1? -15:0)
                   .text( risk + '%')

               })

               // Reselect previously clicked circles
               d3.selectAll('circle.clicked')
                .each(d => {
                  showPath(d)
                  showPath(d)
                })

                // Refilter data
                filter()

            },
            error: function(error){
              // Shows on response error
              console.log('Error:', error.responseJSON.error_message);
              alert('Maximum forecast date-time exceeded.')
            }
          });
        }
     }

     /**
      * @name filter
      * @description Looks at cumulative flight path risk and hides or shows
      */
     function filter(){
       // Remove all routeText
       d3.selectAll('.routeText').remove()

       // Get departing code, arrival code and slider value
       const depCode = d3.select('#dep').property('value')
       const arrCode = d3.select('#arr').property('value')
       const slider = d3.select('#risk').property('value')

       // Update slider label with current value
       d3.select('#slideLab')
        .text(slider + '%')

       // Change route opacity based on slider input
       d3.selectAll('.flightpath')
        .each(d =>  {
          // Find the correct layover code
          const connect = (arrCode === d.Target.Code)
            ? ((depCode === d.Source.Code)
              ? d.Target.Code
              : d.Source.Code)
            : d.Target.Code

          // Collect all paths and cities for layover
          const route = d3.selectAll('#' + connect).filter('.flightpath')
          const routeText = d3.selectAll('#' + connect).filter('.pathText')

          // Calculate total risk
          let data = route.data()
          let risk = data[0].Risk
          for(let i = 1; i < data.length; i++) risk = 100 - (100-risk) * (1 - data[i].Risk / 100)
          risk = Math.round(risk)

          // Hide routes with total risk greater than slider value
          if(risk > slider && !route.attr('data-name')){
              route.style('opacity', 0)
              routeText.style('opacity', 0)
          } else {
              route.style('opacity', .7)
              routeText.style('opacity', 1)
          }
        })
     }

     /**
      * @name showDeets
      * @description shows city name with tool tip
      * @param {Object} d - city object
      */
     function showDeets(d) {
       const hoverClass = d3.select(this).attr('class')
       d['class'] = hoverClass
       tip.show(d);
       d3.select(this).attr('r', 10)
     }

     /**
      * @name hideDeets
      * @description hides city tool tip
      * @param {Object} d - city object
      */
     function hideDeets(d) {
       tip.hide(d);
       d3.selectAll('.layover, .city').attr('r', 5)
     }

     /**
      * @name showPath
      * @description shows path regardless of filter for pinned cities
      * @param {Object} d - city object
      */
     function showPath(d) {
       // Check if other airports exist at city
       let moreAirports = ''
       if(d.City === 'Houston') moreAirports = 'HOU'
       if(d.City === 'Chicago') moreAirports = 'MDW'
       if(d.City === 'New York') moreAirports = 'JFK'

       // Get all relevant routes
       const route = moreAirports === ''
        ? d3.selectAll('#' + d.Code)
        : d3.selectAll('#' + d.Code + ', #'+moreAirports)

        // Check if the route has been pinned by a click and assign original
        // attributes before clicked
        if(route.attr('data-name') === 'clicked'){
          route.attr('data-name', null)
          d3.select('circle#' + d.Code).attr('class', 'layover').attr('r', 5)
          filter()

        // Turn an unclicked route into a clicked route by updating attributes
        } else if(route.filter('.flightpath')[0].length > 0) {
          route.attr('data-name', 'clicked')
          d3.select('circle#' + d.Code).attr('class', 'clicked').attr('r', 10)
          route.filter('.flightpath').style('opacity', 0.7)
          route.filter('.pathText').style('opacity', 1)
        }
     }

     /**
      * @name markerColor
      * @description assigns a color to the small arrow head
      * @param {Object} d - flightpath object
      */
     function markerColor(d){
         let color = colorScale(d.Risk);
         d3.select(this).attr('marker-end', marker(color));
     }

     /**
      * @name fpMouseOver
      * @description enlarges flightpath and shows path tool tip
      * @param {Object} d - flightpath object
      */
      function fpMouseOver(d){
        // Check for overlapping paths and ensure they are not previsiouly
        // hidden
        const otherInd = topAirports.indexOf(d3.select(this).attr('id'))
        let other = ''
        let otherBool = false
        if(otherInd !== -1){
          if(topAirports[otherInd] === 'IAH') other = 'HOU'
          if(topAirports[otherInd] === 'ORD') other = 'MDW'
          if(topAirports[otherInd] === 'LGA') other = 'JFK'
          otherBool = d3.select('path#' + other).style('opacity') != 0
        }

        // If the opacity is not currently 0 for path or otherpath, then
        // show flight details of path
        if(d3.select(this).style('opacity') != 0 || otherBool){
          // Get departure, arrival, and layover codes
          const depCode = d3.select('#dep').property('value')
          const arrCode = d3.select('#arr').property('value')
          const connect = (arrCode === d.Target.Code)
            ? ((depCode === d.Source.Code)
            ? d.Target.Code
            : d.Source.Code)
            : d.Target.Code

          // Determine if overlapping route exists
          let other = ''
          if(connect === 'IAH') other = 'HOU'
          if(connect === 'ORD') other = 'MDW'
          if(connect === 'LGA') other = 'JFK'

          // Gather route data and update marker to bigMarker
          const route = d3.selectAll('#' + connect).filter('.flightpath')
          let data = route.data()
          route.attr('marker-end', d => bigMarker(colorScale(d.Risk)));

          // Swap data so departing is on top
          let swap = data[0]
          if(swap.Source.Code != depCode) {
            data[0] = data[1]
            data[1] = swap
          }

          // Create path tool tip data and check for overlapping flight paths
          const tipPayload = {
            data: data
          }

          // Swap data for overlapping route so departing is on top
          if(other !== ''){
            const routeOther = d3.selectAll('#' + other).filter('.flightpath')
            let dataOther = routeOther.data()

            // Create path tool tip data overlapping route
            swap = dataOther[0]
            if(swap.Source.Code != depCode) {
              dataOther[0] = dataOther[1]
              dataOther[1] = swap
            }

            // Add tool tip data to tool tip payload
            tipPayload['dataOther'] = dataOther
          }

          // Display tool tip and enlarge path stroke-width
          pathtip.show(tipPayload)
          route.attr('stroke-width', 6).style('opacity', 1)
        }
     }

     /**
      * @name fpMouseOut
      * @description returns flight path to previous state
      * @param {Object} d - flightpath object
      */
     function fpMouseOut(d){
       // Check if current selection is not hidden
       if(d3.select(this).style('opacity') != 0){
         // Get slider, dep code, arr code, and connect code
         const slider = d3.select('#risk').property('value')
         const depCode = d3.select('#dep').property('value')
         const arrCode = d3.select('#arr').property('value')
         const connect = (arrCode === d.Target.Code)
           ? ((depCode === d.Source.Code)
             ? d.Target.Code
             : d.Source.Code)
           : d.Target.Code

          // check for overlapping flight path
         let other = ''
         if(connect === 'IAH') other = 'HOU'
         if(connect === 'ORD') other = 'MDW'
         if(connect === 'LGA') other = 'JFK'

         // Return to small marker
         const route = d3.selectAll('#' + connect).filter('.flightpath')
         route.attr('marker-end', d => marker(colorScale(d.Risk)));

         // Remove tool tip and return strok-width and opacity to normal
         pathtip.hide()
         route.attr('stroke-width', 2).style('opacity', 0.7)
         filter()
       }

     }

      /**
       * @name marker
       * @description creates small marker object with necessary color code
       * @param {String} color - flightpath color
       * @return {String}
       */
     function marker(color) {
       defs.append('svg:marker')
           .attr('id', color.replace('#', ''))
           .attr('viewBox', '0 -5 10 10')
           .attr('refX', 10)
           .attr('refY', 0)
           .attr('markerWidth', 9)
           .attr('markerHeight', 9)
           .attr('orient', 'auto')
           .attr('markerUnits', 'userSpaceOnUse')
           .append('svg:path')
           .attr('d', 'M0,-5L10,0L0,5')
           .style('fill', color);

       return 'url(' + color + ')';
    }

    /**
     * @name marker
     * @description creates large marker object with necessary color code
     * @param {String} color - flightpath color
     * @return {String}
     */
     function bigMarker(color) {
       defs.append('svg:marker')
           .attr('id', 'big' + color.replace('#', ''))
           .attr('viewBox', '0 -5 10 10')
           .attr('refX', 8)
           .attr('refY', 0)
           .attr('markerWidth', 20)
           .attr('markerHeight', 20)
           .attr('orient', 'auto')
           .attr('markerUnits', 'userSpaceOnUse')
           .append('svg:path')
           .attr('d', 'M0,-5L10,0L0,5')
           .style('fill', color);

       return 'url(' + '#big' + color.replace('#', '') + ')';
    }

    /**
     * @name remPinnedCities
     * @description Unpins all cities previously selected
     */
    function remPinnedCities() {
       d3.selectAll('circle').attr('data-name', null)
       d3.selectAll('path').attr('data-name', null)
       d3.selectAll('.clicked, .layover')
       .on('mouseover', null)
       .on('mouseout', null)
       .attr('class', 'city')
       .attr('r', 5)
    }
  });
