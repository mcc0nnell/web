import {handle} from '@astrojs/cloudflare/handler'
import {RoomDO, withOpsRouter} from '../worker'

export {RoomDO}

// /api/ops/* is owned by the ops router (RoomDO room runtime); everything
// else falls through to the Astro handler.
export default withOpsRouter(handle)
