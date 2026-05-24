/**
 * API utilities for Eduso external API integration
 * Send game results to Eduso backend
 */

export interface EndGameParams {
  gameCode: string;      // Game identifier (e.g., 'EDUX_ARENA')
  userID: string;        // User ID
  userName: string;      // User display name
  createDate: Date;      // Game start time
  updateDate: Date;      // Game end time
  point: number;         // Final score/XP earned
}

/**
 * Send game result to Eduso API
 * This allows Eduso to track game progress across their platform
 */
export async function sendGameResultToEduso(params: EndGameParams): Promise<boolean> {
  try {
    console.log('Sending game result to Eduso API:', params);

    // Create FormData
    const formData = new FormData();
    formData.append('GameCode', params.gameCode);
    formData.append('UserID', params.userID);
    formData.append('UserName', params.userName);
    formData.append('CreateDate', params.createDate.toISOString());
    formData.append('UpdateDate', params.updateDate.toISOString());
    formData.append('Point', params.point.toString());

    // Send request
    const response = await fetch('https://game.eduso.vn/api/EndEdsGame', {
      method: 'POST',
      body: formData,
      credentials: 'include', // Send cookies for authentication
    });

    if (!response.ok) {
      console.error('Failed to send game result to Eduso:', response.status, response.statusText);
      return false;
    }

    const result = await response.json();
    console.log('Game result sent to Eduso successfully:', result);
    return true;

  } catch (error) {
    console.error('Error sending game result to Eduso:', error);
    return false;
  }
}

/**
 * Helper to create EndGameParams from game session data
 */
export function createEndGameParams(
  userID: string,
  userName: string,
  startTime: Date,
  xpEarned: number,
  gameCode: string = 'EDUX_ARENA'
): EndGameParams {
  return {
    gameCode,
    userID,
    userName,
    createDate: startTime,
    updateDate: new Date(),
    point: xpEarned,
  };
}
