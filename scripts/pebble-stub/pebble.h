/*
 * A stand-in for the real <pebble.h>, just complete enough to type-check the
 * code this app generates. It is only used by `npm run check:c`; nothing here
 * ships to the watch.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct { int16_t x, y; } GPoint;
typedef struct { int16_t w, h; } GSize;
typedef struct { GPoint origin; GSize size; } GRect;
typedef struct { uint8_t argb; } GColor;

#define GPoint(px, py) ((GPoint){ (int16_t)(px), (int16_t)(py) })
#define GRect(rx, ry, rw, rh) ((GRect){ { (int16_t)(rx), (int16_t)(ry) }, { (int16_t)(rw), (int16_t)(rh) } })
#define GColorFromRGB(r, g, b) ((GColor){ (uint8_t)(((r) & 0xC0) | (((g) & 0xC0) >> 2) | (((b) & 0xC0) >> 4)) })
/* Named constants exist on every platform; 1-bit targets only ever use these two. */
#define GColorBlack ((GColor){ 0x00 })
#define GColorWhite ((GColor){ 0xFF })
#define GColorClear ((GColor){ 0x01 })

typedef struct Window Window;
typedef struct Layer Layer;
typedef struct GContext GContext;
typedef struct GBitmap GBitmap;
typedef void *GFont;
typedef void *ResHandle;
typedef uint32_t ResourceId;

typedef enum { GCornerNone = 0, GCornersAll = 0x0F } GCornerMask;
typedef enum { GTextOverflowModeWordWrap, GTextOverflowModeTrailingEllipsis } GTextOverflowMode;
typedef enum { GTextAlignmentLeft, GTextAlignmentCenter, GTextAlignmentRight } GTextAlignment;
typedef enum { GOvalScaleModeFitCircle, GOvalScaleModeFillCircle } GOvalScaleMode;
typedef enum { GCompOpAssign, GCompOpSet } GCompOp;
typedef struct GTextAttributes GTextAttributes;

#define TRIG_MAX_ANGLE 0x10000
#define TRIG_MAX_RATIO 0xffff
#define DEG_TO_TRIGANGLE(angle) (((angle) * TRIG_MAX_ANGLE) / 360)
int32_t sin_lookup(int32_t angle);
int32_t cos_lookup(int32_t angle);

#define FONT_KEY_GOTHIC_14 "RESOURCE_ID_GOTHIC_14"
#define FONT_KEY_GOTHIC_14_BOLD "RESOURCE_ID_GOTHIC_14_BOLD"
#define FONT_KEY_GOTHIC_18 "RESOURCE_ID_GOTHIC_18"
#define FONT_KEY_GOTHIC_18_BOLD "RESOURCE_ID_GOTHIC_18_BOLD"
#define FONT_KEY_GOTHIC_24 "RESOURCE_ID_GOTHIC_24"
#define FONT_KEY_GOTHIC_24_BOLD "RESOURCE_ID_GOTHIC_24_BOLD"
#define FONT_KEY_GOTHIC_28 "RESOURCE_ID_GOTHIC_28"
#define FONT_KEY_GOTHIC_28_BOLD "RESOURCE_ID_GOTHIC_28_BOLD"
#define FONT_KEY_BITHAM_30_BLACK "RESOURCE_ID_BITHAM_30_BLACK"
#define FONT_KEY_BITHAM_34_MEDIUM_NUMBERS "RESOURCE_ID_BITHAM_34_MEDIUM_NUMBERS"
#define FONT_KEY_BITHAM_42_BOLD "RESOURCE_ID_BITHAM_42_BOLD"
#define FONT_KEY_BITHAM_42_LIGHT "RESOURCE_ID_BITHAM_42_LIGHT"
#define FONT_KEY_BITHAM_42_MEDIUM_NUMBERS "RESOURCE_ID_BITHAM_42_MEDIUM_NUMBERS"
#define FONT_KEY_ROBOTO_CONDENSED_21 "RESOURCE_ID_ROBOTO_CONDENSED_21"
#define FONT_KEY_ROBOTO_BOLD_SUBSET_49 "RESOURCE_ID_ROBOTO_BOLD_SUBSET_49"
#define FONT_KEY_DROID_SERIF_28_BOLD "RESOURCE_ID_DROID_SERIF_28_BOLD"
#define FONT_KEY_LECO_20_BOLD_NUMBERS "RESOURCE_ID_LECO_20_BOLD_NUMBERS"
#define FONT_KEY_LECO_26_BOLD_NUMBERS_AM_PM "RESOURCE_ID_LECO_26_BOLD_NUMBERS_AM_PM"
#define FONT_KEY_LECO_28_LIGHT_NUMBERS "RESOURCE_ID_LECO_28_LIGHT_NUMBERS"
#define FONT_KEY_LECO_32_BOLD_NUMBERS "RESOURCE_ID_LECO_32_BOLD_NUMBERS"
#define FONT_KEY_LECO_36_BOLD_NUMBERS "RESOURCE_ID_LECO_36_BOLD_NUMBERS"
#define FONT_KEY_LECO_38_BOLD_NUMBERS "RESOURCE_ID_LECO_38_BOLD_NUMBERS"
#define FONT_KEY_LECO_42_NUMBERS "RESOURCE_ID_LECO_42_NUMBERS"

GFont fonts_get_system_font(const char *font_key);
GFont fonts_load_custom_font(ResHandle handle);
void fonts_unload_custom_font(GFont font);
ResHandle resource_get_handle(ResourceId resource_id);

GBitmap *gbitmap_create_with_resource(ResourceId resource_id);
void gbitmap_destroy(GBitmap *bitmap);

void graphics_context_set_fill_color(GContext *ctx, GColor color);
void graphics_context_set_stroke_color(GContext *ctx, GColor color);
void graphics_context_set_text_color(GContext *ctx, GColor color);
void graphics_context_set_stroke_width(GContext *ctx, uint8_t width);
void graphics_context_set_compositing_mode(GContext *ctx, GCompOp mode);
void graphics_fill_rect(GContext *ctx, GRect rect, uint16_t radius, GCornerMask mask);
void graphics_draw_rect(GContext *ctx, GRect rect);
void graphics_draw_round_rect(GContext *ctx, GRect rect, uint16_t radius);
void graphics_fill_circle(GContext *ctx, GPoint p, uint16_t radius);
void graphics_draw_circle(GContext *ctx, GPoint p, uint16_t radius);
void graphics_draw_line(GContext *ctx, GPoint p0, GPoint p1);
void graphics_fill_radial(GContext *ctx, GRect rect, GOvalScaleMode scale_mode,
                          uint16_t inset_thickness, int32_t angle_start, int32_t angle_end);
void graphics_draw_bitmap_in_rect(GContext *ctx, GBitmap *bitmap, GRect rect);
void graphics_draw_text(GContext *ctx, const char *text, GFont font, GRect box,
                        GTextOverflowMode overflow_mode, GTextAlignment alignment,
                        GTextAttributes *attributes);

typedef struct {
  uint32_t num_points;
  GPoint *points;
} GPathInfo;
typedef struct GPath GPath;
GPath *gpath_create(const GPathInfo *init);
void gpath_destroy(GPath *path);
void gpath_draw_filled(GContext *ctx, GPath *path);
void gpath_draw_outline(GContext *ctx, GPath *path);
void gpath_move_to(GPath *path, GPoint point);
void gpath_rotate_to(GPath *path, int32_t angle);

typedef void (*LayerUpdateProc)(Layer *layer, GContext *ctx);
Layer *layer_create(GRect frame);
void layer_destroy(Layer *layer);
void layer_set_update_proc(Layer *layer, LayerUpdateProc proc);
void layer_add_child(Layer *parent, Layer *child);
GRect layer_get_bounds(Layer *layer);
void layer_mark_dirty(Layer *layer);

typedef struct {
  void (*load)(Window *window);
  void (*appear)(Window *window);
  void (*disappear)(Window *window);
  void (*unload)(Window *window);
} WindowHandlers;

Window *window_create(void);
void window_destroy(Window *window);
void window_set_background_color(Window *window, GColor color);
void window_set_window_handlers(Window *window, WindowHandlers handlers);
void window_stack_push(Window *window, bool animated);
Layer *window_get_root_layer(Window *window);

typedef enum {
  SECOND_UNIT = 1, MINUTE_UNIT = 2, HOUR_UNIT = 4, DAY_UNIT = 8, MONTH_UNIT = 16, YEAR_UNIT = 32
} TimeUnits;
typedef void (*TickHandler)(struct tm *tick_time, TimeUnits units_changed);
void tick_timer_service_subscribe(TimeUnits units, TickHandler handler);
void tick_timer_service_unsubscribe(void);

typedef struct { uint8_t charge_percent; bool is_charging; bool is_plugged; } BatteryChargeState;
typedef void (*BatteryStateHandler)(BatteryChargeState charge);
BatteryChargeState battery_state_service_peek(void);
void battery_state_service_subscribe(BatteryStateHandler handler);
void battery_state_service_unsubscribe(void);

typedef struct {
  void (*pebble_app_connection_handler)(bool connected);
  void (*pebblekit_connection_handler)(bool connected);
} ConnectionHandlers;
bool connection_service_peek_pebble_app_connection(void);
void connection_service_subscribe(ConnectionHandlers handlers);
void connection_service_unsubscribe(void);

void vibes_double_pulse(void);
void app_event_loop(void);

#define PBL_HEALTH 1
typedef enum {
  HealthMetricStepCount, HealthMetricActiveSeconds, HealthMetricHeartRateBPM,
  HealthMetricRestingHeartRateBPM
} HealthMetric;
typedef enum {
  HealthEventSignificantUpdate, HealthEventMovementUpdate, HealthEventSleepUpdate,
  HealthEventHeartRateUpdate
} HealthEventType;
typedef int32_t HealthValue;
typedef void (*HealthEventHandler)(HealthEventType event, void *context);
typedef enum {
  HealthServiceAccessibilityMaskAvailable = 1 << 0,
  HealthServiceAccessibilityMaskNoPermission = 1 << 1,
  HealthServiceAccessibilityMaskNotSupported = 1 << 2,
  HealthServiceAccessibilityMaskNotAvailable = 0,
} HealthServiceAccessibilityMask;
HealthValue health_service_sum_today(HealthMetric metric);
HealthValue health_service_peek_current_value(HealthMetric metric);
HealthServiceAccessibilityMask health_service_metric_accessible(
    HealthMetric metric, time_t time_start, time_t time_end);
bool health_service_events_subscribe(HealthEventHandler handler, void *context);
bool health_service_events_unsubscribe(void);

/* ---- AppMessage, used by the weather companion ---- */
typedef struct DictionaryIterator DictionaryIterator;
typedef union {
  uint8_t data[1];
  char cstring[1];
  uint8_t uint8;
  int8_t int8;
  uint16_t uint16;
  int16_t int16;
  uint32_t uint32;
  int32_t int32;
} TupleValue;
typedef struct {
  uint32_t key;
  uint16_t length;
  TupleValue value[1];
} Tuple;

typedef enum { APP_MSG_OK = 0, APP_MSG_SEND_TIMEOUT = 1 } AppMessageResult;
typedef void (*AppMessageInboxReceived)(DictionaryIterator *iterator, void *context);

Tuple *dict_find(const DictionaryIterator *iter, uint32_t key);
uint32_t dict_write_uint8(DictionaryIterator *iter, uint32_t key, uint8_t value);
AppMessageResult app_message_outbox_begin(DictionaryIterator **iter);
AppMessageResult app_message_outbox_send(void);
AppMessageResult app_message_open(uint32_t size_inbound, uint32_t size_outbound);
uint32_t app_message_inbox_size_maximum(void);
uint32_t app_message_outbox_size_maximum(void);
void app_message_register_inbox_received(AppMessageInboxReceived handler);
void app_message_deregister_callbacks(void);

/* ---- Compass and timers ---- */
#define TRIGANGLE_TO_DEG(trig_angle) (((trig_angle) * 360) / TRIG_MAX_ANGLE)

typedef enum {
  CompassStatusDataInvalid = 0,
  CompassStatusCalibrating = 1,
  CompassStatusCalibrated = 2
} CompassStatus;

typedef struct {
  int32_t magnetic_heading;
  int32_t true_heading;
  CompassStatus compass_status;
  bool is_declination_valid;
} CompassHeadingData;

typedef void (*CompassHeadingHandler)(CompassHeadingData heading);
void compass_service_subscribe(CompassHeadingHandler handler);
void compass_service_unsubscribe(void);

typedef struct AppTimer AppTimer;
typedef void (*AppTimerCallback)(void *data);
AppTimer *app_timer_register(uint32_t timeout_ms, AppTimerCallback callback, void *data);
bool app_timer_cancel(AppTimer *timer);
