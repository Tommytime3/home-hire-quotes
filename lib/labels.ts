// Plain-English labels for stored answers, used on the staff review screens.
export const LABELS: Record<string, Record<string, string>> = {
  job_type: {
    ducted_heat_pump: "Heating & AC system",
    ductless: "Ductless mini-split",
    heat_pump_water_heater: "Heat pump water heater",
  },
  home_type: {
    single_family: "Single-family house",
    townhouse: "Townhouse",
    condo_apartment: "Condo or apartment",
    adu_back_house: "Back house / ADU",
    duplex_multiplex: "Duplex / multi-unit",
    mobile_home: "Mobile home (we don't take these)",
    other: "Other",
  },
  indoor_location: {
    garage: "Garage", closet: "Hall or interior closet", attic_easy: "Attic (easy access)",
    attic_tight: "Attic (tight)", crawlspace: "Crawlspace", basement: "Basement", rooftop: "Rooftop", other: "Other",
  },
  outdoor_location: {
    side_yard_left: "Left side yard", side_yard_right: "Right side yard", backyard: "Backyard",
    front_yard: "Front yard", roof: "Roof", none: "None", other: "Other",
  },
  water_heater_location: {
    garage: "Garage", closet: "Closet", laundry: "Laundry / utility", attic: "Attic",
    basement: "Basement", outside: "Outside", other: "Other",
  },
  panel_location: {
    outside_wall: "Outside wall", meter_room: "Shared meter room", garage: "Garage", hallway: "Hallway / closet",
    laundry: "Laundry / utility", basement: "Basement", other: "Other", unsure: "Couldn't find it",
  },
  panel_type: { main: "Main panel", sub: "Sub panel", unsure: "Not sure" },
  meter_at_panel: { yes: "Meter at panel", no: "No meter at panel", unsure: "Not sure" },
  service_lines: { overhead: "Overhead", underground: "Underground (PG&E involved)", unsure: "Not sure" },
  supply_location: { floor: "Floor", ceiling: "Ceiling", high_wall: "High wall", mixed: "Mixed", unsure: "Not sure" },
  return_location: {
    ceiling: "Ceiling", high_wall: "High wall", low_wall: "Low wall / floor", closet_door: "Closet door", unsure: "Not sure",
  },
  airflow_config: { upflow: "Upflow", downflow: "Downflow", horizontal: "Horizontal", unsure: "Not sure" },
  status: {
    capturing: "Filling out now", submitted: "New", in_review: "In review",
    quoted: "Quoted", signed: "Signed", declined: "Declined",
  },
};

export const CONTACT_LABELS: Record<string, string> = {
  video: "Wants a video call now",
  call: "Tapped Call now",
  later: "Wants a call back",
  text: "Wants quote by text",
};

export const ZONE_LABELS: Record<string, string> = {
  back_left: "Back left", back_center: "Back middle", back_right: "Back right",
  middle_left: "Middle left", middle: "Center", middle_right: "Middle right",
  front_left: "Front left", front_center: "Front middle", front_right: "Front right", unsure: "Not sure",
};

export const STEP_LABELS: Record<string, string> = {
  outdoor_unit: "Outdoor unit", outdoor_data_plate: "Outdoor label", line_set_route: "Line set route",
  indoor_unit: "Indoor unit", indoor_data_plate: "Unit / tank label", hatch_or_closet_measurement: "Opening measurement",
  door_width_measurement: "Door width", panel_video: "Panel video", panel: "Panel (door open)",
  panel_label: "Main breaker", main_panel: "Main panel", service_lines: "Service lines",
  second_system: "Second system", second_indoor_data_plate: "Second indoor label",
  second_outdoor_data_plate: "Second outdoor label", mini_split: "Mini-splits",
  return_grille: "Return grille", walkthrough: "Walkthrough", water_heater: "Water heater", other: "Other",
};

export function label(group: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return LABELS[group]?.[value] ?? value;
}
