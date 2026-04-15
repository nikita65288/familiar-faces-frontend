export type FriendshipStatus = "PENDING" | "ACCEPTED" | "REJECTED" | 1 | 2 | 3;

export type FriendshipDto = {
    id: number;
    requesterId: number;
    addresseeId: number;
    status: FriendshipStatus;
    createdAt: string;
    updatedAt: string;
};

export const isAccepted = (s: FriendshipStatus) => s === "ACCEPTED" || s === 2;
export const isPending = (s: FriendshipStatus) => s === "PENDING" || s === 1;